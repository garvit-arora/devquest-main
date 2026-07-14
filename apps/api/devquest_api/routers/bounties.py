from __future__ import annotations

import json
import os
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query

from .. import state
from ..deps import optional_user, require_user
from ..models import GitHubUser, LedgerRecord, LedgerType
from ..user_store import save_github_user

router = APIRouter(prefix="/api", tags=["bounties"])

EARNING_TYPES = {
    LedgerType.signup_bonus,
    LedgerType.quest_reward_settled,
    LedgerType.repository_star_reward,
    LedgerType.pull_request_reward,
    LedgerType.repository_reward_settled,
    LedgerType.offer_reward,
    LedgerType.promotional_credit,
    LedgerType.referral_bonus,
    LedgerType.sponsor_reward,
    LedgerType.issue_bounty_reward,
    LedgerType.streak_bonus,
    LedgerType.referral_tier_bonus,
    LedgerType.credit_boost_bonus,
    LedgerType.achievement_reward,
}

LEVELS = [
    {
        "id": "rookie",
        "name": "Rookie",
        "threshold": 0,
        "daily_api_calls": 500,
        "rate_limit": "base",
        "unlocks": ["Create API keys", "Join public bounties"],
    },
    {
        "id": "builder",
        "name": "Builder",
        "threshold": 500,
        "daily_api_calls": 750,
        "rate_limit": "plus",
        "unlocks": ["More daily API calls", "Early campaign access"],
    },
    {
        "id": "maintainer",
        "name": "Maintainer",
        "threshold": 1500,
        "daily_api_calls": 1200,
        "rate_limit": "maintainer",
        "unlocks": ["Higher rate limits", "Priority bounty review"],
    },
    {
        "id": "elite",
        "name": "Elite",
        "threshold": 5000,
        "daily_api_calls": 2500,
        "rate_limit": "elite",
        "unlocks": ["Better model access", "Bigger PR bounties"],
    },
    {
        "id": "partner",
        "name": "Partner",
        "threshold": 12000,
        "daily_api_calls": 5000,
        "rate_limit": "partner",
        "unlocks": ["Partner campaigns", "Highest public bounty multipliers"],
    },
]

BOUNTY_CATEGORIES = [
    {
        "id": "star_repo",
        "title": "Star repo",
        "reward_credits": 200,
        "description": "Star approved repositories and keep the star active to retain API access.",
    },
    {
        "id": "merged_pr",
        "title": "Merged PR",
        "reward_credits": 150,
        "description": "Submit a meaningful pull request to an approved campaign and verify it after merge.",
    },
    {
        "id": "fix_issue",
        "title": "Fix issue",
        "reward_credits": 500,
        "description": "Resolve approved GitHub issues once issue bounty campaigns are configured.",
    },
    {
        "id": "add_test",
        "title": "Add test",
        "reward_credits": 200,
        "description": "Add meaningful coverage for approved issue bounty work.",
    },
    {
        "id": "write_docs",
        "title": "Write docs",
        "reward_credits": 100,
        "description": "Improve documentation for sponsor or DevQuest repositories.",
    },
    {
        "id": "example_integration",
        "title": "Build integration",
        "reward_credits": 300,
        "description": "Publish useful examples that show developers how to use DevQuest.",
    },
]


@router.get("/bounties")
async def list_bounties(user: GitHubUser | None = Depends(optional_user)) -> dict[str, object]:
    tasks = star_bounty_tasks(user) + pull_request_bounty_tasks(user) + issue_bounty_tasks(user) + configured_bounty_tasks()
    live_tasks = [task for task in tasks if task["status"] != "coming_soon"]
    return {
        "rank": rank_for_user(user.id) if user else None,
        "summary": {
            "live_tasks": len(live_tasks),
            "available_credits": sum(int(task["reward_credits"]) for task in live_tasks if task["status"] != "completed"),
            "completed_tasks": len([task for task in tasks if task["status"] == "completed"]),
            "categories": len(BOUNTY_CATEGORIES),
        },
        "categories": BOUNTY_CATEGORIES,
        "tasks": tasks,
    }


@router.get("/leaderboard")
async def leaderboard(
    period: str = Query(default="weekly", pattern="^(weekly|monthly|all)$"),
    user: GitHubUser | None = Depends(optional_user),
) -> dict[str, object]:
    start = period_start(period)
    entries = [leaderboard_entry(github_user, start) for github_user in state.github_users.values()]
    entries = [entry for entry in entries if entry["points"] > 0 or entry["credits_earned"] > 0]
    entries.sort(key=lambda item: (int(item["points"]), int(item["credits_earned"]), int(item["quests_completed"])), reverse=True)
    ranked_entries = [{**entry, "position": index + 1} for index, entry in enumerate(entries[:50])]
    me = leaderboard_entry(user, start) if user else None
    if me:
        all_entries = sorted(
            [leaderboard_entry(github_user, start) for github_user in state.github_users.values()],
            key=lambda item: (int(item["points"]), int(item["credits_earned"]), int(item["quests_completed"])),
            reverse=True,
        )
        me["position"] = next((index + 1 for index, entry in enumerate(all_entries) if entry["user_id"] == user.id), None)
    return {
        "period": period,
        "levels": LEVELS,
        "me": me,
        "data": ranked_entries,
    }


@router.get("/rank")
async def my_rank(user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    return {"rank": rank_for_user(user.id), "levels": LEVELS}


def star_bounty_tasks(user: GitHubUser | None) -> list[dict[str, object]]:
    tasks: list[dict[str, object]] = []
    for repository in state.repositories.values():
        if repository.status != "active":
            continue
        entitlement = state.entitlements.get(f"{user.id}:{repository.id}") if user else None
        completed = bool(entitlement and entitlement.reward_awarded and entitlement.status == "verified")
        tasks.append(
            {
                "id": f"star:{repository.id}",
                "type": "star_repo",
                "title": "Star repo",
                "repository": f"{repository.owner}/{repository.name}",
                "description": repository.description or "Star this repository to unlock credits and API access.",
                "reward_credits": repository.reward_credits,
                "status": "completed" if completed else "available",
                "action_href": "/app/projects",
                "external_url": repository.url,
                "sponsor_name": repository.sponsor_name,
                "progress": {
                    "current": repository.current_star_count,
                    "target": repository.star_target,
                    "target_bonus_calls": repository.target_bonus_calls,
                },
            }
        )
    return tasks


def pull_request_bounty_tasks(user: GitHubUser | None) -> list[dict[str, object]]:
    tasks: list[dict[str, object]] = []
    for campaign in state.pull_request_campaigns.values():
        if campaign.status != "active":
            continue
        user_rewards = [
            reward
            for reward in state.pull_request_rewards.values()
            if user and reward.user_id == user.id and reward.campaign_id == campaign.id and reward.reward_awarded
        ]
        tasks.append(
            {
                "id": f"pr:{campaign.id}",
                "type": "merged_pr",
                "title": "Merged PR",
                "repository": f"{campaign.owner}/{campaign.name}",
                "description": campaign.description or "Open a meaningful pull request and verify it after merge.",
                "reward_credits": campaign.reward_credits,
                "status": "available",
                "completed_count": len(user_rewards),
                "action_href": "/app/pull-requests",
                "external_url": campaign.url,
                "sponsor_name": campaign.sponsor_name,
            }
        )
    return tasks


def issue_bounty_tasks(user: GitHubUser | None) -> list[dict[str, object]]:
    tasks: list[dict[str, object]] = []
    for bounty in state.issue_bounties.values():
        if bounty.status != "active":
            continue
        user_rewards = [
            reward
            for reward in state.issue_bounty_rewards.values()
            if user and reward.user_id == user.id and reward.bounty_id == bounty.id and reward.reward_awarded
        ]
        tasks.append(
            {
                "id": f"issue:{bounty.id}",
                "type": bounty.kind if bounty.kind in {"fix_issue", "add_test", "write_docs", "example_integration"} else "fix_issue",
                "title": bounty.title,
                "repository": f"{bounty.owner}/{bounty.name}#{bounty.issue_number}",
                "description": bounty.description or "Close this GitHub issue with a merged pull request to earn credits.",
                "reward_credits": bounty.reward_credits,
                "status": "completed" if user_rewards else "available",
                "completed_count": len(user_rewards),
                "action_href": "/app/issue-bounties",
                "external_url": bounty.issue_url,
                "sponsor_name": bounty.sponsor_name,
                "deadline": bounty.deadline,
            }
        )
    return tasks


def configured_bounty_tasks() -> list[dict[str, object]]:
    configured = parse_configured_bounties()
    if configured:
        return configured
    return [
        {
            "id": f"coming-soon:{category['id']}",
            "type": category["id"],
            "title": category["title"],
            "repository": "Campaigns opening soon",
            "description": category["description"],
            "reward_credits": category["reward_credits"],
            "status": "coming_soon",
            "action_href": "/app/sponsors",
            "external_url": None,
            "sponsor_name": None,
        }
        for category in BOUNTY_CATEGORIES
        if category["id"] in {"fix_issue", "write_docs", "example_integration"}
    ]


def parse_configured_bounties() -> list[dict[str, object]]:
    raw = os.getenv("DEVQUEST_BOUNTY_TASKS", "").strip()
    if not raw:
        return []
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(payload, list):
        return []
    tasks = []
    for index, item in enumerate(payload):
        if not isinstance(item, dict):
            continue
        bounty_type = str(item.get("type") or "fix_issue")
        title = str(item.get("title") or bounty_type.replace("_", " ").title())
        reward = int(item.get("reward_credits") or category_reward(bounty_type))
        repository = str(item.get("repository") or "Configured repository")
        tasks.append(
            {
                "id": str(item.get("id") or f"configured:{index}"),
                "type": bounty_type,
                "title": title,
                "repository": repository,
                "description": str(item.get("description") or "Complete this configured bounty and submit proof for review."),
                "reward_credits": reward,
                "status": str(item.get("status") or "available"),
                "action_href": str(item.get("action_href") or "/app/pull-requests"),
                "external_url": item.get("external_url") or item.get("url"),
                "sponsor_name": item.get("sponsor_name"),
            }
        )
    return tasks


def category_reward(bounty_type: str) -> int:
    category = next((item for item in BOUNTY_CATEGORIES if item["id"] == bounty_type), None)
    return int(category["reward_credits"]) if category else 100


def leaderboard_entry(user: GitHubUser, start: datetime | None) -> dict[str, object]:
    records = settled_earning_records(user.id, start)
    credits_earned = sum(max(0, record.amount) for record in records)
    credits_spent = sum(
        abs(record.amount)
        for record in state.ledger.records
        if record.user_id == user.id
        and record.status == "settled"
        and record.type == LedgerType.api_usage_settled
        and in_period(record.created_at, start)
    )
    merged_prs = len(
        [
            reward
            for reward in state.pull_request_rewards.values()
            if reward.user_id == user.id and reward.reward_awarded and in_period(reward.verified_at or reward.created_at, start)
        ]
    )
    quests_completed = len(
        [
            entitlement
            for entitlement in state.entitlements.values()
            if entitlement.user_id == user.id and entitlement.reward_awarded and in_period(entitlement.last_verified_at, start)
        ]
    )
    referrals = len(
        [
            referral
            for referral in state.referrals.values()
            if referral.referrer_user_id == user.id and referral.status == "settled" and in_period(referral.awarded_at or referral.created_at, start)
        ]
    )
    sponsor_campaigns_completed = len(
        [
            entitlement
            for entitlement in state.entitlements.values()
            if entitlement.user_id == user.id
            and entitlement.reward_awarded
            and state.repositories.get(entitlement.repository_id)
            and state.repositories[entitlement.repository_id].sponsor_name
            and in_period(entitlement.last_verified_at, start)
        ]
    )
    issue_bounties_completed = len(
        [
            reward
            for reward in state.issue_bounty_rewards.values()
            if reward.user_id == user.id and reward.reward_awarded and in_period(reward.verified_at or reward.created_at, start)
        ]
    )
    points = credits_earned + merged_prs * 100 + issue_bounties_completed * 150 + quests_completed * 50 + referrals * 100 + sponsor_campaigns_completed * 50
    lifetime = lifetime_points(user.id)
    level = sync_developer_level(user.id, level_for_points(lifetime))
    return {
        "user_id": user.id,
        "login": user.login,
        "name": user.name,
        "avatar_url": user.avatar_url,
        "credits_earned": credits_earned,
        "credits_spent": credits_spent,
        "merged_prs": merged_prs,
        "issue_bounties_completed": issue_bounties_completed,
        "quests_completed": quests_completed,
        "referrals": referrals,
        "sponsor_campaigns_completed": sponsor_campaigns_completed,
        "points": points,
        "level": level,
    }


def rank_for_user(user_id: str) -> dict[str, object]:
    points = lifetime_points(user_id)
    level = sync_developer_level(user_id, level_for_points(points))
    next_level = next((item for item in LEVELS if int(item["threshold"]) > points), None)
    return {
        "points": points,
        "level": level,
        "next_level": next_level,
        "points_to_next": max(0, int(next_level["threshold"]) - points) if next_level else 0,
    }


def lifetime_points(user_id: str) -> int:
    user = state.github_users.get(user_id)
    if not user:
        return 0
    entry = leaderboard_entry_without_level(user, None)
    return int(entry["points"])


def leaderboard_entry_without_level(user: GitHubUser, start: datetime | None) -> dict[str, object]:
    records = settled_earning_records(user.id, start)
    credits_earned = sum(max(0, record.amount) for record in records)
    merged_prs = len(
        [
            reward
            for reward in state.pull_request_rewards.values()
            if reward.user_id == user.id and reward.reward_awarded and in_period(reward.verified_at or reward.created_at, start)
        ]
    )
    quests_completed = len(
        [
            entitlement
            for entitlement in state.entitlements.values()
            if entitlement.user_id == user.id and entitlement.reward_awarded and in_period(entitlement.last_verified_at, start)
        ]
    )
    referrals = len(
        [
            referral
            for referral in state.referrals.values()
            if referral.referrer_user_id == user.id and referral.status == "settled" and in_period(referral.awarded_at or referral.created_at, start)
        ]
    )
    sponsor_campaigns_completed = len(
        [
            entitlement
            for entitlement in state.entitlements.values()
            if entitlement.user_id == user.id
            and entitlement.reward_awarded
            and state.repositories.get(entitlement.repository_id)
            and state.repositories[entitlement.repository_id].sponsor_name
            and in_period(entitlement.last_verified_at, start)
        ]
    )
    issue_bounties_completed = len(
        [
            reward
            for reward in state.issue_bounty_rewards.values()
            if reward.user_id == user.id and reward.reward_awarded and in_period(reward.verified_at or reward.created_at, start)
        ]
    )
    return {
        "credits_earned": credits_earned,
        "merged_prs": merged_prs,
        "issue_bounties_completed": issue_bounties_completed,
        "quests_completed": quests_completed,
        "referrals": referrals,
        "sponsor_campaigns_completed": sponsor_campaigns_completed,
        "points": credits_earned + merged_prs * 100 + issue_bounties_completed * 150 + quests_completed * 50 + referrals * 100 + sponsor_campaigns_completed * 50,
    }


def level_for_points(points: int) -> dict[str, object]:
    level = LEVELS[0]
    for candidate in LEVELS:
        if points >= int(candidate["threshold"]):
            level = candidate
    return level


def sync_developer_level(user_id: str, level: dict[str, object]) -> dict[str, object]:
    user = state.github_users.get(user_id)
    level_id = str(level["id"])
    if user and user.developer_level != level_id:
        user.developer_level = level_id
        state.github_users[user.id] = user
        save_github_user(user, state.github_tokens.get(user.id))
    return level


def settled_earning_records(user_id: str, start: datetime | None) -> list[LedgerRecord]:
    return [
        record
        for record in state.ledger.records
        if record.user_id == user_id
        and record.status == "settled"
        and record.amount > 0
        and record.type in EARNING_TYPES
        and in_period(record.created_at, start)
    ]


def period_start(period: str) -> datetime | None:
    now = datetime.utcnow()
    if period == "weekly":
        return now - timedelta(days=7)
    if period == "monthly":
        return now - timedelta(days=30)
    return None


def in_period(value: datetime | None, start: datetime | None) -> bool:
    if start is None:
        return True
    if value is None:
        return False
    comparable = value.replace(tzinfo=None) if value.tzinfo else value
    return comparable >= start
