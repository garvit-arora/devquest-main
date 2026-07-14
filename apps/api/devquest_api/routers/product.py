from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import state
from ..deps import require_user
from ..models import GitHubUser, LedgerRecord, LedgerType
from ..providers import public_models
from ..services.entitlements import refresh_user_repository_status

router = APIRouter(prefix="/api", tags=["product"])


@router.get("/dashboard")
async def dashboard(user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    await refresh_user_repository_status(user, include_untracked=True, force_refresh=True)
    records = visible_ledger_records(user.id)
    wallet = wallet_summary(records)
    earned = wallet["earned"] + wallet["referral_bonus"] + wallet["sponsor_reward"]
    consumed = wallet["spent"]
    lifetime_repo_rewards = len([record for record in records if record.type == LedgerType.repository_star_reward and record.amount > 0])
    starred = [item for item in state.entitlements.values() if item.user_id == user.id and item.status == "verified"]
    active_keys = [record for record in state.api_keys.values() if record.user_id == user.id and record.status == "active"]
    balance = state.ledger.balance(user.id)
    if not starred:
        access_status = "No eligible repository starred"
    elif balance <= 0:
        access_status = "Credits exhausted"
    elif not active_keys:
        access_status = "Verification pending"
    else:
        access_status = "Active"

    return {
        "user": user.model_dump(),
        "credit_balance": balance,
        "credits_earned_from_stars": earned,
        "credits_consumed": consumed,
        "credits_spent_lifetime": consumed,
        "wallet_summary": wallet,
        "repository_rewards_lifetime": lifetime_repo_rewards,
        "credits_pending_verification": 0,
        "api_access_status": access_status,
        "starred_repository_count": len(starred),
        "allowed_models": [model.id for model in public_models()],
        "active_api_key_count": len(active_keys),
        "recent_activity": wallet_records_with_balance(records)[-10:][::-1],
    }


@router.get("/ledger")
async def list_ledger(user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    records = visible_ledger_records(user.id)
    return {
        "balance": state.ledger.balance(user.id),
        "summary": wallet_summary(records),
        "data": wallet_records_with_balance(records),
    }


@router.get("/notifications")
async def list_notifications(user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    return {"data": state.notifications[user.id]}


@router.get("/usage")
async def api_usage(user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    user_logs = [record for record in state.api_request_logs if record["user_id"] == user.id]
    ledger_spent = sum(abs(record.amount) for record in state.ledger.records if record.user_id == user.id and record.type == LedgerType.api_usage_settled)
    failures = [record for record in user_logs if int(record.get("status", 0)) >= 400]
    return {
        "data": user_logs,
        "summary": {
            "total_requests": len(user_logs),
            "failed_requests": len(failures),
            "total_tokens": sum(int(record.get("total_tokens", 0)) for record in user_logs),
            "prompt_tokens": sum(int(record.get("prompt_tokens", 0)) for record in user_logs),
            "completion_tokens": sum(int(record.get("completion_tokens", 0)) for record in user_logs),
            "credits_used": ledger_spent,
            "lifetime_credits_spent": ledger_spent,
        },
        "model_usage": aggregate_usage(user_logs, "model"),
        "top_api_keys": aggregate_usage(user_logs, "key_prefix"),
        "failed_calls": failures[-25:][::-1],
    }


def aggregate_usage(records: list[dict[str, object]], key: str) -> list[dict[str, object]]:
    buckets: dict[str, dict[str, object]] = {}
    for record in records:
        name = str(record.get(key) or "unknown")
        current = buckets.setdefault(
            name,
            {
                "id": name,
                "requests": 0,
                "failed_requests": 0,
                "credits": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "last_used_at": None,
            },
        )
        status = int(record.get("status", 0))
        current["requests"] = int(current["requests"]) + 1
        current["failed_requests"] = int(current["failed_requests"]) + (1 if status >= 400 else 0)
        current["credits"] = int(current["credits"]) + (int(record.get("credits", 0)) if status < 400 else 0)
        current["prompt_tokens"] = int(current["prompt_tokens"]) + int(record.get("prompt_tokens", 0))
        current["completion_tokens"] = int(current["completion_tokens"]) + int(record.get("completion_tokens", 0))
        current["total_tokens"] = int(current["total_tokens"]) + int(record.get("total_tokens", 0))
        timestamp = str(record.get("timestamp") or "")
        if timestamp and (current["last_used_at"] is None or timestamp > str(current["last_used_at"])):
            current["last_used_at"] = timestamp
    return sorted(buckets.values(), key=lambda item: (int(item["requests"]), int(item["credits"])), reverse=True)


def visible_ledger_records(user_id: str) -> list[LedgerRecord]:
    return [
        record
        for record in state.ledger.records
        if record.user_id == user_id and not (record.type == LedgerType.manual_adjustment and record.amount == 0)
    ]


def wallet_summary(records: list[LedgerRecord]) -> dict[str, int]:
    summary = {
        "earned": 0,
        "spent": 0,
        "revoked": 0,
        "referral_bonus": 0,
        "sponsor_reward": 0,
        "pending": 0,
    }
    for record in records:
        category = wallet_category(record)
        amount = record.amount
        if record.status == "pending":
            summary["pending"] += abs(amount)
            continue
        if record.status != "settled":
            continue
        if category == "spent":
            summary["spent"] += abs(amount)
        elif category == "revoked":
            summary["revoked"] += abs(amount)
        elif category == "referral_bonus":
            summary["referral_bonus"] += max(0, amount)
        elif category == "sponsor_reward":
            summary["sponsor_reward"] += max(0, amount)
        elif category == "earned":
            summary["earned"] += max(0, amount)
    return summary


def wallet_record(record: LedgerRecord) -> dict[str, object]:
    payload = record.model_dump(mode="json")
    category = wallet_category(record)
    payload.update(
        {
            "category": category,
            "label": wallet_label(record, category),
            "direction": wallet_direction(record, category),
        }
    )
    return payload


def wallet_records_with_balance(records: list[LedgerRecord]) -> list[dict[str, object]]:
    ordered = sorted(records, key=lambda record: (record.created_at, record.id))
    balance = 0
    output: list[dict[str, object]] = []
    for record in ordered:
        if record.status == "settled":
            balance += record.amount
        payload = wallet_record(record)
        payload["remaining_balance"] = balance
        output.append(payload)
    return output


def wallet_category(record: LedgerRecord) -> str:
    source = str(record.metadata.get("source") or "").lower()
    if record.status == "released":
        return "revoked"
    if record.type in {
        LedgerType.api_usage_reserved,
        LedgerType.api_usage_settled,
        LedgerType.model_usage,
        LedgerType.marketplace_purchase,
    }:
        return "spent"
    if record.type in {
        LedgerType.reward_reversal,
        LedgerType.fraud_reversal,
        LedgerType.expiration,
        LedgerType.quest_reward_reversed,
    }:
        return "revoked"
    if record.type in {LedgerType.referral_bonus, LedgerType.referral_tier_bonus} or (record.type == LedgerType.promotional_credit and source == "referral"):
        return "referral_bonus"
    if record.type == LedgerType.sponsor_reward or record.type == LedgerType.offer_reward or source == "sponsor":
        return "sponsor_reward"
    if record.type in {
        LedgerType.signup_bonus,
        LedgerType.quest_reward_settled,
        LedgerType.repository_star_reward,
        LedgerType.pull_request_reward,
        LedgerType.issue_bounty_reward,
        LedgerType.streak_bonus,
        LedgerType.credit_boost_bonus,
        LedgerType.achievement_reward,
        LedgerType.repository_reward_settled,
        LedgerType.promotional_credit,
        LedgerType.refund,
        LedgerType.api_usage_released,
    }:
        return "earned"
    if record.amount < 0:
        return "revoked"
    return "earned"


def wallet_direction(record: LedgerRecord, category: str) -> str:
    if record.status == "pending":
        return "pending"
    if category in {"spent", "revoked"}:
        return "debit"
    return "credit"


def wallet_label(record: LedgerRecord, category: str) -> str:
    metadata = record.metadata
    if record.type == LedgerType.referral_tier_bonus:
        return f"Referral tier bonus: {metadata.get('tier_referrals', '')} referrals".strip()
    if category == "referral_bonus":
        referred = metadata.get("referred_login")
        return f"Referral bonus: {referred}" if referred else "Referral bonus"
    if category == "sponsor_reward":
        sponsor = metadata.get("sponsor_name")
        repository = metadata.get("repository")
        if sponsor and repository:
            return f"Sponsor reward: {sponsor} / {repository}"
        if sponsor:
            return f"Sponsor reward: {sponsor}"
        return "Sponsor reward"
    if record.type == LedgerType.repository_star_reward:
        owner = metadata.get("owner")
        name = metadata.get("name")
        return f"Repository star reward: {owner}/{name}" if owner and name else "Repository star reward"
    if record.type == LedgerType.pull_request_reward:
        repository = metadata.get("repository")
        pull_request_number = metadata.get("pull_request_number")
        if repository and pull_request_number:
            return f"Merged PR reward: {repository} #{pull_request_number}"
        return "Merged PR reward"
    if record.type == LedgerType.api_usage_settled:
        if metadata.get("kind") == "workflow_execution":
            return f"Workflow run: {metadata.get('workflow_name', 'Automation')}"
        model = metadata.get("model")
        return f"API request: {model}" if model else "API request"
    if record.type == LedgerType.api_usage_reserved:
        return "API request reserved"
    if record.type == LedgerType.issue_bounty_reward:
        repository = metadata.get("repository")
        issue_number = metadata.get("issue_number")
        if repository and issue_number:
            return f"Issue bounty reward: {repository} #{issue_number}"
        return "Issue bounty reward"
    if record.type == LedgerType.streak_bonus:
        return f"Streak bonus: {metadata.get('streak_days', 7)} days"
    if record.type == LedgerType.credit_boost_bonus:
        return f"Credit boost: {metadata.get('event_title', 'Boost event')}"
    if record.type == LedgerType.achievement_reward:
        return f"Achievement: {metadata.get('achievement_title', 'DevQuest achievement')}"
    if record.type == LedgerType.marketplace_purchase:
        return f"Marketplace purchase: {metadata.get('item_title', 'DevQuest item')}"
    if record.type == LedgerType.api_usage_released or record.type == LedgerType.refund:
        return "Unused credits returned"
    if category == "revoked":
        return str(record.type).replace("_", " ").title()
    return str(record.type).replace("_", " ").title()
