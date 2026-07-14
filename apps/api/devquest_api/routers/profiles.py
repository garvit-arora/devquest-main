from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import state
from .bounties import rank_for_user

router = APIRouter(prefix="/api", tags=["profiles"])


@router.get("/profiles/{login}")
async def public_profile(login: str) -> dict[str, object]:
    user = next((candidate for candidate in state.github_users.values() if candidate.login.lower() == login.lower()), None)
    if not user:
        raise HTTPException(status_code=404, detail="developer profile not found")
    completed_quests = [item for item in state.entitlements.values() if item.user_id == user.id and item.reward_awarded]
    merged_prs = [item for item in state.pull_request_rewards.values() if item.user_id == user.id and item.reward_awarded]
    issue_bounties = [item for item in state.issue_bounty_rewards.values() if item.user_id == user.id and item.reward_awarded]
    earned_records = [
        record
        for record in state.ledger.records
        if record.user_id == user.id and record.status == "settled" and record.amount > 0
    ]
    referrals = [record for record in state.referrals.values() if record.referrer_user_id == user.id and record.status == "settled"]
    rank = rank_for_user(user.id)
    badges = profile_badges(rank, len(referrals), len(merged_prs), len(issue_bounties))
    return {
        "user": user.model_dump(mode="json"),
        "rank": rank,
        "badges": badges,
        "stats": {
            "completed_quests": len(completed_quests),
            "merged_prs": len(merged_prs),
            "issue_bounties": len(issue_bounties),
            "successful_referrals": len(referrals),
            "credits_earned": sum(record.amount for record in earned_records),
        },
        "completed_quests": [
            {
                "repository_id": item.repository_id,
                "reward_credits": item.reward_credits,
                "last_verified_at": item.last_verified_at,
            }
            for item in completed_quests[-20:]
        ],
        "merged_prs": [item.model_dump(mode="json") for item in merged_prs[-20:]],
        "issue_bounties": [item.model_dump(mode="json") for item in issue_bounties[-20:]],
    }


@router.get("/campaigns")
async def list_campaigns() -> dict[str, object]:
    campaigns = [campaign_payload(repo.id) for repo in state.repositories.values() if repo.status == "active"]
    return {"data": campaigns}


@router.get("/campaigns/{campaign_id:path}")
async def campaign_detail(campaign_id: str) -> dict[str, object]:
    if campaign_id not in state.repositories:
        raise HTTPException(status_code=404, detail="campaign not found")
    return campaign_payload(campaign_id, detail=True)


def campaign_payload(campaign_id: str, *, detail: bool = False) -> dict[str, object]:
    repo = state.repositories[campaign_id]
    entitlements = [item for item in state.entitlements.values() if item.repository_id == repo.id]
    verified = [item for item in entitlements if item.status == "verified"]
    rewarded = [item for item in verified if item.reward_awarded]
    pr_campaigns = [
        campaign
        for campaign in state.pull_request_campaigns.values()
        if campaign.owner.lower() == repo.owner.lower() and campaign.name.lower() == repo.name.lower()
    ]
    issue_bounties = [
        bounty
        for bounty in state.issue_bounties.values()
        if bounty.owner.lower() == repo.owner.lower() and bounty.name.lower() == repo.name.lower()
    ]
    top_contributors = top_contributors_for_repo(repo.id)
    target_stars = repo.star_target or len(rewarded)
    current_stars = repo.current_star_count if repo.current_star_count is not None else len(verified)
    payload = {
        "id": repo.id,
        "sponsor_name": repo.sponsor_name,
        "repository": f"{repo.owner}/{repo.name}",
        "repository_url": repo.url,
        "description": repo.description,
        "target_stars": target_stars,
        "current_stars": current_stars,
        "remaining_stars": max(0, target_stars - current_stars),
        "reward_credits": repo.reward_credits,
        "rewards_left_estimate": max(0, target_stars - len(rewarded)) * repo.reward_credits,
        "campaign_deadline": repo.campaign_end_date,
        "top_contributors": top_contributors,
        "pr_bounties": [campaign.model_dump(mode="json") for campaign in pr_campaigns],
        "issue_bounties": [bounty.model_dump(mode="json") for bounty in issue_bounties],
    }
    if detail:
        payload["recent_rewards"] = [
            record.model_dump(mode="json")
            for record in state.ledger.records
            if record.metadata.get("repository") == repo.id or record.related_quest_id == repo.id
        ][-30:][::-1]
    return payload


def top_contributors_for_repo(repository_id: str) -> list[dict[str, object]]:
    scores: dict[str, dict[str, object]] = {}
    for entitlement in state.entitlements.values():
        if entitlement.repository_id == repository_id and entitlement.reward_awarded:
            user = state.github_users.get(entitlement.user_id)
            if not user:
                continue
            entry = scores.setdefault(user.id, {"login": user.login, "avatar_url": user.avatar_url, "credits": 0, "quests": 0, "prs": 0})
            entry["credits"] = int(entry["credits"]) + entitlement.reward_credits
            entry["quests"] = int(entry["quests"]) + 1
    for reward in state.pull_request_rewards.values():
        if reward.repository == repository_id and reward.reward_awarded:
            user = state.github_users.get(reward.user_id)
            if not user:
                continue
            entry = scores.setdefault(user.id, {"login": user.login, "avatar_url": user.avatar_url, "credits": 0, "quests": 0, "prs": 0})
            entry["credits"] = int(entry["credits"]) + reward.reward_credits
            entry["prs"] = int(entry["prs"]) + 1
    for reward in state.issue_bounty_rewards.values():
        if reward.repository == repository_id and reward.reward_awarded:
            user = state.github_users.get(reward.user_id)
            if not user:
                continue
            entry = scores.setdefault(user.id, {"login": user.login, "avatar_url": user.avatar_url, "credits": 0, "quests": 0, "prs": 0})
            entry["credits"] = int(entry["credits"]) + reward.reward_credits
            entry["prs"] = int(entry["prs"]) + 1
    return sorted(scores.values(), key=lambda item: (int(item["credits"]), int(item["quests"]), int(item["prs"])), reverse=True)[:10]


def profile_badges(rank: dict[str, object], referrals: int, merged_prs: int, issue_bounties: int) -> list[str]:
    badges = [str(rank["level"]["name"])]
    if referrals >= 25:
        badges.append("Partner")
    elif referrals >= 10:
        badges.append("Network Builder")
    elif referrals >= 5:
        badges.append("Connector")
    if merged_prs >= 1:
        badges.append("PR Contributor")
    if issue_bounties >= 1:
        badges.append("Issue Solver")
    return list(dict.fromkeys(badges))
