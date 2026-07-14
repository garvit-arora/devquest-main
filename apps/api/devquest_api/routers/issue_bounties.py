from __future__ import annotations

import re
from datetime import datetime
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException

from .. import state
from ..deps import add_notification, require_user
from ..issue_bounty_store import issue_bounty_from_create, save_issue_bounty, save_issue_bounty_reward
from ..models import AdminUser, GitHubUser, IssueBountyCreate, IssueBountyReward, IssueBountyVerificationInput, LedgerType
from ..services.boosts import award_boost_bonus
from .admin import require_admin

router = APIRouter(prefix="/api/issue-bounties", tags=["issue-bounties"])

PR_URL_PATTERN = re.compile(r"^https://github\.com/(?P<owner>[^/\s]+)/(?P<name>[^/\s]+)/pull/(?P<number>\d+)/?$", re.IGNORECASE)


@router.get("")
async def list_issue_bounties(user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    rewards = [reward.model_dump(mode="json") for reward in state.issue_bounty_rewards.values() if reward.user_id == user.id]
    return {
        "data": [bounty.model_dump(mode="json") for bounty in state.issue_bounties.values()],
        "rewards": rewards,
        "balance": state.ledger.balance(user.id),
    }


@router.post("/verify")
async def verify_issue_bounty(input: IssueBountyVerificationInput, user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    bounty = state.issue_bounties.get(input.bounty_id)
    if not bounty:
        raise HTTPException(status_code=404, detail="issue bounty not found")
    if bounty.status != "active":
        raise HTTPException(status_code=409, detail="issue bounty is not active")
    parsed = parse_pull_request_url(input.pull_request_url)
    if parsed["owner"].lower() != bounty.owner.lower() or parsed["name"].lower() != bounty.name.lower():
        raise HTTPException(status_code=422, detail="pull request must belong to the bounty repository")

    reward_key = f"{user.id}:{bounty.id}:{parsed['number']}"
    existing = state.issue_bounty_rewards.get(reward_key)
    if existing and existing.reward_awarded:
        return {"reward": existing.model_dump(mode="json"), "balance": state.ledger.balance(user.id)}

    verification = await fetch_closing_issue_verification(user, bounty.owner, bounty.name, int(parsed["number"]))
    status, reason = evaluate_issue_bounty(user, bounty.issue_number, verification)
    reward = existing or IssueBountyReward(
        id=reward_key,
        user_id=user.id,
        bounty_id=bounty.id,
        pull_request_url=input.pull_request_url.rstrip("/"),
        pull_request_number=int(parsed["number"]),
        issue_number=bounty.issue_number,
        repository=f"{bounty.owner.lower()}/{bounty.name.lower()}",
        reward_credits=bounty.reward_credits,
    )
    reward.status = status
    reward.reason = reason
    reward.verified_at = datetime.utcnow()
    reward.merged_at = parse_datetime(verification.get("mergedAt"))

    if status == "merged_closes_issue":
        idempotency_key = f"issue-bounty:{reward_key}"
        if not reward.reward_awarded and idempotency_key not in state.ledger.idempotency_keys:
            state.ledger.append(
                user_id=user.id,
                amount=bounty.reward_credits,
                transaction_type=LedgerType.issue_bounty_reward,
                related_quest_id=bounty.id,
                idempotency_key=idempotency_key,
                metadata={
                    "repository": reward.repository,
                    "issue_number": bounty.issue_number,
                    "issue_url": bounty.issue_url,
                    "pull_request_url": reward.pull_request_url,
                    "pull_request_number": reward.pull_request_number,
                    "source": "issue_bounty",
                    "sponsor_name": bounty.sponsor_name,
                },
            )
            award_boost_bonus(
                user_id=user.id,
                reward_kind=bounty.kind,
                base_amount=bounty.reward_credits,
                idempotency_key=reward_key,
                metadata={
                    "related_quest_id": bounty.id,
                    "repository": reward.repository,
                    "issue_number": bounty.issue_number,
                    "issue_url": bounty.issue_url,
                    "pull_request_url": reward.pull_request_url,
                    "pull_request_number": reward.pull_request_number,
                    "sponsor_name": bounty.sponsor_name,
                },
            )
            add_notification(user.id, "Issue bounty unlocked", f"{bounty.reward_credits} credits awarded for closing issue #{bounty.issue_number} in {bounty.owner}/{bounty.name}.")
        reward.reward_awarded = True

    state.issue_bounty_rewards[reward.id] = reward
    save_issue_bounty_reward(reward)
    return {"reward": reward.model_dump(mode="json"), "balance": state.ledger.balance(user.id)}


@router.post("/admin")
async def create_issue_bounty(input: IssueBountyCreate, _admin: AdminUser = Depends(require_admin)) -> dict[str, object]:
    bounty = issue_bounty_from_create(input)
    existing = state.issue_bounties.get(bounty.id)
    if existing:
        bounty.created_at = existing.created_at
    state.issue_bounties[bounty.id] = bounty
    save_issue_bounty(bounty)
    return bounty.model_dump(mode="json")


def parse_pull_request_url(url: str) -> dict[str, str]:
    match = PR_URL_PATTERN.match(url.strip())
    if not match:
        raise HTTPException(status_code=422, detail="Enter a valid GitHub pull request URL")
    return match.groupdict()


async def fetch_closing_issue_verification(user: GitHubUser, owner: str, name: str, number: int) -> dict[str, object]:
    token = state.github_tokens.get(user.id)
    if not token:
        raise HTTPException(status_code=401, detail="GitHub connection is required before verifying issue bounties")
    query = """
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          number
          merged
          mergedAt
          author { login }
          closingIssuesReferences(first: 20) {
            nodes { number state url title }
          }
        }
      }
    }
    """
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://api.github.com/graphql",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            json={"query": query, "variables": {"owner": owner, "name": name, "number": number}},
        )
    if response.status_code in {403, 429}:
        raise HTTPException(status_code=503, detail="GitHub rate limit prevented issue bounty verification")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="GitHub issue bounty verification failed")
    payload = response.json()
    if payload.get("errors"):
        raise HTTPException(status_code=502, detail="GitHub could not verify closing issue references")
    pull_request = ((payload.get("data") or {}).get("repository") or {}).get("pullRequest")
    if not pull_request:
        raise HTTPException(status_code=404, detail="pull request was not found")
    return pull_request


def evaluate_issue_bounty(user: GitHubUser, issue_number: int, payload: dict[str, object]) -> tuple[str, str | None]:
    author = payload.get("author") if isinstance(payload.get("author"), dict) else {}
    author_login = str(author.get("login") or "") if isinstance(author, dict) else ""
    if author_login.lower() != user.login.lower():
        return "rejected", "This pull request was not opened by your GitHub account."
    if payload.get("merged") is not True:
        return "pending", "This pull request has not been merged yet."
    closing_refs = payload.get("closingIssuesReferences")
    nodes = closing_refs.get("nodes", []) if isinstance(closing_refs, dict) else []
    if not any(isinstance(node, dict) and int(node.get("number", 0)) == issue_number for node in nodes):
        return "rejected", f"This merged pull request does not close issue #{issue_number}."
    return "merged_closes_issue", None


def parse_datetime(value: object) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
