from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException

from .. import state
from ..deps import add_notification, require_user
from ..models import GitHubUser, LedgerType

router = APIRouter(prefix="/api/streaks", tags=["streaks"])

STREAK_BONUS_CREDITS = 100
STREAK_BONUS_DAYS = 7


@router.get("")
async def streak_summary(user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    active_days = sorted(activity_days(user.id), reverse=True)
    current = current_streak(active_days)
    weekly = weekly_activity(active_days)
    already_claimed = streak_bonus_claimed(user.id, date.today())
    return {
        "current_streak_days": current,
        "weekly_activity": weekly,
        "can_claim_bonus": current >= STREAK_BONUS_DAYS and not already_claimed,
        "bonus_credits": STREAK_BONUS_CREDITS,
        "bonus_days_required": STREAK_BONUS_DAYS,
        "claimed_today": already_claimed,
        "actions": [
            "verify GitHub active",
            "complete one quest",
            "run one workflow",
            "contribute one PR",
        ],
        "balance": state.ledger.balance(user.id),
    }


@router.post("/claim")
async def claim_streak_bonus(user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    active_days = sorted(activity_days(user.id), reverse=True)
    current = current_streak(active_days)
    today = date.today()
    if current < STREAK_BONUS_DAYS:
        raise HTTPException(status_code=409, detail="streak is not long enough yet")
    if streak_bonus_claimed(user.id, today):
        raise HTTPException(status_code=409, detail="streak bonus already claimed today")
    record = state.ledger.append(
        user_id=user.id,
        amount=STREAK_BONUS_CREDITS,
        transaction_type=LedgerType.streak_bonus,
        idempotency_key=f"streak:{user.id}:{today.isoformat()}",
        metadata={"source": "streak", "streak_days": current, "bonus_days_required": STREAK_BONUS_DAYS},
    )
    add_notification(user.id, "Streak bonus unlocked", f"{STREAK_BONUS_CREDITS} credits awarded for a {current}-day DevQuest streak.")
    return {"bonus": record.model_dump(mode="json"), "balance": state.ledger.balance(user.id)}


def activity_days(user_id: str) -> set[date]:
    days: set[date] = set()
    for entitlement in state.entitlements.values():
        if entitlement.user_id == user_id and entitlement.last_verified_at:
            days.add(to_date(entitlement.last_verified_at))
    for reward in state.pull_request_rewards.values():
        if reward.user_id == user_id and (reward.verified_at or reward.created_at):
            days.add(to_date(reward.verified_at or reward.created_at))
    for reward in state.issue_bounty_rewards.values():
        if reward.user_id == user_id and (reward.verified_at or reward.created_at):
            days.add(to_date(reward.verified_at or reward.created_at))
    for execution in state.workflow_executions:
        if execution.user_id == user_id:
            days.add(to_date(execution.started_at))
    return days


def current_streak(days: list[date]) -> int:
    day_set = set(days)
    cursor = date.today()
    if cursor not in day_set and cursor - timedelta(days=1) in day_set:
        cursor = cursor - timedelta(days=1)
    count = 0
    while cursor in day_set:
        count += 1
        cursor = cursor - timedelta(days=1)
    return count


def weekly_activity(days: list[date]) -> list[dict[str, object]]:
    day_set = set(days)
    start = date.today() - timedelta(days=6)
    return [
        {
            "date": (start + timedelta(days=offset)).isoformat(),
            "active": (start + timedelta(days=offset)) in day_set,
        }
        for offset in range(7)
    ]


def streak_bonus_claimed(user_id: str, day: date) -> bool:
    return any(
        record.user_id == user_id
        and record.type == LedgerType.streak_bonus
        and record.metadata.get("source") == "streak"
        and record.created_at.date() == day
        for record in state.ledger.records
    )


def to_date(value: datetime) -> date:
    return value.replace(tzinfo=None).date() if value.tzinfo else value.date()
