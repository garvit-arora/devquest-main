from __future__ import annotations

from time import time

from fastapi import HTTPException

from .. import state
from ..config import settings
from ..deps import now_utc
from ..models import ChatCompletionRequest, LedgerType
from ..security import KeyRecord, verify_api_key
from ..activity_store import save_api_request_log
from .audit import record_platform_log
from .achievements import award_api_usage_achievements

RANK_RATE_LIMITS = [
    (12000, 30, 5000),
    (5000, 20, 2500),
    (1500, 12, 1200),
    (500, 8, 750),
    (0, 5, 500),
]

RANK_EARNING_TYPES = {
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


def authenticate_api_key(authorization: str | None) -> KeyRecord:
    if not authorization or not authorization.startswith("Bearer "):
        record_platform_log("warning", "gateway_missing_key", "Gateway request rejected because the API key was missing.")
        raise HTTPException(status_code=401, detail={"error": {"message": "Missing API key", "type": "invalid_request_error"}})
    raw = authorization.removeprefix("Bearer ").strip()
    prefix = raw[:12]
    record = state.api_keys.get(prefix)
    if not record or record.status != "active" or not verify_api_key(raw, record.key_hash):
        record_platform_log("warning", "gateway_invalid_key", "Gateway request rejected because the API key was invalid.", {"prefix": prefix})
        raise HTTPException(status_code=401, detail={"error": {"message": "Invalid API key", "type": "invalid_api_key"}})
    return record


def enforce_rate_limits(record: KeyRecord) -> None:
    current_time = time()
    minute = state.rate_minute[record.id]
    day = state.rate_day[record.id]
    minute_limit, day_limit = rank_rate_limits(record.user_id)
    while minute and current_time - minute[0] > 60:
        minute.popleft()
    while day and current_time - day[0] > 86400:
        day.popleft()
    if len(minute) >= minute_limit:
        record_platform_log("warning", "gateway_rate_limit", "Minute rate limit exceeded.", {"key_prefix": record.prefix, "key_id": record.id, "limit": minute_limit})
        raise HTTPException(status_code=429, detail={"error": {"message": "Rate limit exceeded", "type": "rate_limit_error"}})
    if len(day) >= day_limit:
        record_platform_log("warning", "gateway_day_limit", "Daily request limit exceeded.", {"key_prefix": record.prefix, "key_id": record.id, "limit": day_limit})
        raise HTTPException(status_code=429, detail={"error": {"message": "Daily request limit exceeded", "type": "rate_limit_error"}})
    if state.active_requests[record.id] >= settings.max_concurrent_requests:
        record_platform_log("warning", "gateway_concurrent_limit", "Concurrent request limit exceeded.", {"key_prefix": record.prefix, "key_id": record.id})
        raise HTTPException(status_code=429, detail={"error": {"message": "Concurrent request limit exceeded", "type": "rate_limit_error"}})
    minute.append(current_time)
    day.append(current_time)


def rank_rate_limits(user_id: str) -> tuple[int, int]:
    points = rank_points(user_id)
    for threshold, minute_limit, day_limit in RANK_RATE_LIMITS:
        if points >= threshold:
            return max(settings.max_requests_per_minute, minute_limit), max(settings.max_requests_per_day, day_limit)
    return settings.max_requests_per_minute, settings.max_requests_per_day


def rank_points(user_id: str) -> int:
    earned = sum(
        max(0, record.amount)
        for record in state.ledger.records
        if record.user_id == user_id and record.status == "settled" and record.amount > 0 and record.type in RANK_EARNING_TYPES
    )
    merged_prs = len([reward for reward in state.pull_request_rewards.values() if reward.user_id == user_id and reward.reward_awarded])
    quests_completed = len([entitlement for entitlement in state.entitlements.values() if entitlement.user_id == user_id and entitlement.reward_awarded])
    referrals = len([referral for referral in state.referrals.values() if referral.referrer_user_id == user_id and referral.status == "settled"])
    sponsor_campaigns_completed = len(
        [
            entitlement
            for entitlement in state.entitlements.values()
            if entitlement.user_id == user_id
            and entitlement.reward_awarded
            and state.repositories.get(entitlement.repository_id)
            and state.repositories[entitlement.repository_id].sponsor_name
        ]
    )
    return earned + merged_prs * 100 + quests_completed * 50 + referrals * 100 + sponsor_campaigns_completed * 50


def validate_request_limits(request: ChatCompletionRequest) -> None:
    input_chars = sum(len(message.content) for message in request.messages)
    if input_chars > settings.max_input_chars:
        record_platform_log("warning", "gateway_input_too_large", "Gateway request exceeded the input character limit.", {"input_chars": input_chars})
        raise HTTPException(status_code=400, detail={"error": {"message": "Input is too large", "type": "invalid_request_error"}})
    if request.max_tokens and request.max_tokens > settings.max_output_tokens:
        record_platform_log("warning", "gateway_output_too_large", "Gateway request exceeded the max output token limit.", {"max_tokens": request.max_tokens})
        raise HTTPException(status_code=400, detail={"error": {"message": "Max output tokens exceeds platform limit", "type": "invalid_request_error"}})


def enforce_key_credit_limit(record: KeyRecord, estimated_credits: int) -> None:
    used = sum(
        abs(item.amount)
        for item in state.ledger.records
        if item.type == LedgerType.api_usage_settled and item.metadata.get("key_prefix") == record.prefix
    )
    if used + estimated_credits > record.spending_limit:
        record_platform_log("warning", "gateway_key_credit_limit", "API key credit limit exceeded.", {"key_prefix": record.prefix, "estimated_credits": estimated_credits})
        raise HTTPException(status_code=402, detail={"error": {"message": "API key credit limit exceeded", "type": "insufficient_quota"}})


def record_api_usage(key: KeyRecord, request: ChatCompletionRequest, request_id: str, credits: int, started: float, status: int, response: dict[str, object] | None = None, *, api_kind: str = "chat") -> None:
    usage = response.get("usage", {}) if response else {}
    prompt_tokens = int(usage.get("prompt_tokens", 0)) if isinstance(usage, dict) else 0
    completion_tokens = int(usage.get("completion_tokens", 0)) if isinstance(usage, dict) else 0
    total_tokens = int(usage.get("total_tokens", prompt_tokens + completion_tokens)) if isinstance(usage, dict) else 0
    log = {
        "timestamp": now_utc().isoformat(),
        "request_id": request_id,
        "key_prefix": key.prefix,
        "user_id": key.user_id,
        "model": request.model,
        "credits": credits,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "latency_ms": int((time() - started) * 1000),
        "status": status,
        "api_kind": api_kind,
    }
    state.api_request_logs.append(log)
    save_api_request_log(log)
    award_api_usage_achievements(key.user_id, model=request.model, api_kind=api_kind, status=status)
    if status >= 400:
        record_platform_log("error", "gateway_request_failed", f"Gateway request {request_id} failed with status {status}.", {"request_id": request_id, "key_prefix": key.prefix, "model": request.model, "status": status})
