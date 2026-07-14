from __future__ import annotations

import re
from datetime import datetime
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException

from .. import state
from ..deps import add_notification, optional_user, require_user
from ..models import AdminUser, GitHubUser, LedgerType, PullRequestCampaign, PullRequestCampaignCreate, PullRequestReward, PullRequestVerificationInput
from ..pull_request_store import save_pull_request_campaign, save_pull_request_reward
from ..services.boosts import award_boost_bonus
from .admin import require_admin

router = APIRouter(prefix="/api/pull-requests", tags=["pull-requests"])

PR_URL_PATTERN = re.compile(r"^https://github\.com/(?P<owner>[^/\s]+)/(?P<name>[^/\s]+)/pull/(?P<number>\d+)/?$", re.IGNORECASE)


@router.get("")
async def list_pull_request_campaigns(user: GitHubUser | None = Depends(optional_user)) -> dict[str, object]:
    rewards = []
    if user:
        rewards = [reward.model_dump(mode="json") for reward in state.pull_request_rewards.values() if reward.user_id == user.id]
    return {
        "data": [campaign.model_dump(mode="json") for campaign in state.pull_request_campaigns.values()],
        "rewards": rewards,
        "reward_credits": 150,
        "balance": state.ledger.balance(user.id) if user else 0,
    }


@router.post("/admin")
async def create_pull_request_campaign(input: PullRequestCampaignCreate, _admin: AdminUser = Depends(require_admin)) -> dict[str, object]:
    owner = input.owner.strip()
    name = input.name.strip()
    campaign = PullRequestCampaign(
        id=f"{owner.lower()}/{name.lower()}",
        owner=owner,
        name=name,
        url=input.url or f"https://github.com/{owner}/{name}",
        description=input.description,
        reward_credits=input.reward_credits,
        status=input.status,
        sponsor_name=input.sponsor_name,
    )
    state.pull_request_campaigns[campaign.id] = campaign
    save_pull_request_campaign(campaign)
    return campaign.model_dump(mode="json")


@router.post("/verify")
async def verify_pull_request(input: PullRequestVerificationInput, user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    parsed = parse_pull_request_url(input.pull_request_url)
    campaign = campaign_for_repository(parsed["owner"], parsed["name"])
    if not campaign:
        raise HTTPException(status_code=404, detail="pull request repository is not configured for rewards")
    if campaign.status != "active":
        raise HTTPException(status_code=409, detail="pull request reward campaign is not active")

    reward_key = f"{user.id}:{campaign.id}:{parsed['number']}"
    existing = state.pull_request_rewards.get(reward_key)
    if existing and existing.reward_awarded:
        return {"reward": existing.model_dump(mode="json"), "balance": state.ledger.balance(user.id)}

    github_payload = await fetch_pull_request(user, campaign, int(parsed["number"]))
    status, reason = evaluate_pull_request(user, github_payload)
    reward = existing or PullRequestReward(
        id=reward_key,
        user_id=user.id,
        campaign_id=campaign.id,
        pull_request_url=input.pull_request_url.rstrip("/"),
        pull_request_number=int(parsed["number"]),
        repository=campaign.id,
        reward_credits=campaign.reward_credits,
    )
    reward.status = status
    reward.reason = reason
    reward.verified_at = datetime.utcnow()
    reward.merged_at = parse_datetime(github_payload.get("merged_at"))

    if status == "merged":
        idempotency_key = f"pull-request:{reward_key}"
        if not reward.reward_awarded and idempotency_key not in state.ledger.idempotency_keys:
            state.ledger.append(
                user_id=user.id,
                amount=campaign.reward_credits,
                transaction_type=LedgerType.pull_request_reward,
                related_quest_id=campaign.id,
                idempotency_key=idempotency_key,
                metadata={
                    "repository": campaign.id,
                    "pull_request_url": reward.pull_request_url,
                    "pull_request_number": reward.pull_request_number,
                    "source": "pull_request",
                },
            )
            award_boost_bonus(
                user_id=user.id,
                reward_kind="pull_request",
                base_amount=campaign.reward_credits,
                idempotency_key=reward_key,
                metadata={
                    "related_quest_id": campaign.id,
                    "repository": campaign.id,
                    "pull_request_url": reward.pull_request_url,
                    "pull_request_number": reward.pull_request_number,
                },
            )
            add_notification(user.id, "Pull request reward unlocked", f"{campaign.reward_credits} credits awarded for merged PR #{reward.pull_request_number} in {campaign.owner}/{campaign.name}.")
        reward.reward_awarded = True

    state.pull_request_rewards[reward.id] = reward
    save_pull_request_reward(reward)
    return {"reward": reward.model_dump(mode="json"), "balance": state.ledger.balance(user.id)}


def parse_pull_request_url(url: str) -> dict[str, str]:
    match = PR_URL_PATTERN.match(url.strip())
    if not match:
        raise HTTPException(status_code=422, detail="Enter a valid GitHub pull request URL")
    return match.groupdict()


def campaign_for_repository(owner: str, name: str) -> PullRequestCampaign | None:
    repo_id = f"{owner.lower()}/{name.lower()}"
    return next((campaign for campaign in state.pull_request_campaigns.values() if campaign.id == repo_id or (campaign.owner.lower() == owner.lower() and campaign.name.lower() == name.lower())), None)


async def fetch_pull_request(user: GitHubUser, campaign: PullRequestCampaign, number: int) -> dict[str, object]:
    token = state.github_tokens.get(user.id)
    if not token:
        raise HTTPException(status_code=401, detail="GitHub connection is required before verifying pull requests")
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"https://api.github.com/repos/{campaign.owner}/{campaign.name}/pulls/{number}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        )
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="pull request was not found")
    if response.status_code in {403, 429}:
        raise HTTPException(status_code=503, detail="GitHub rate limit prevented PR verification")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="GitHub pull request verification failed")
    return response.json()


def evaluate_pull_request(user: GitHubUser, payload: dict[str, object]) -> tuple[str, str | None]:
    author = payload.get("user") if isinstance(payload.get("user"), dict) else {}
    author_login = str(author.get("login") or "") if isinstance(author, dict) else ""
    if author_login.lower() != user.login.lower():
        return "rejected", "This pull request was not opened by your GitHub account."
    if not payload.get("merged_at"):
        return "pending", "This pull request has not been merged yet."
    if payload.get("draft") is True:
        return "pending", "Draft pull requests are not eligible until merged as ready work."
    return "merged", None


def parse_datetime(value: object) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
