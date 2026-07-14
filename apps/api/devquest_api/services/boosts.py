from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any

from .. import state
from ..deps import add_notification
from ..models import LedgerType

EXAMPLE_BOOST_EVENTS = [
    {
        "id": "weekend-pr-rush",
        "title": "Weekend PR Rush",
        "description": "2x credits on eligible merged PR rewards during a configured weekend window.",
        "kind": "pull_request",
        "multiplier": 2,
        "bonus_credits": 0,
        "first_n": None,
        "starts_at": None,
        "ends_at": None,
        "status": "example",
    },
    {
        "id": "docs-week",
        "title": "Docs Week",
        "description": "+100 bonus credits for approved documentation issue bounties.",
        "kind": "write_docs",
        "multiplier": 1,
        "bonus_credits": 100,
        "first_n": None,
        "starts_at": None,
        "ends_at": None,
        "status": "example",
    },
    {
        "id": "first-50-merged-prs",
        "title": "First 50 merged PRs",
        "description": "Extra credits for the first configured number of merged PR rewards.",
        "kind": "pull_request",
        "multiplier": 1,
        "bonus_credits": 100,
        "first_n": 50,
        "starts_at": None,
        "ends_at": None,
        "status": "example",
    },
]


def boost_events() -> list[dict[str, object]]:
    configured = configured_boost_events()
    active = [{**event, "status": "active"} for event in configured if event_is_active(event)]
    scheduled = [{**event, "status": "scheduled"} for event in configured if not event_is_active(event)]
    return active + scheduled + ([] if configured else EXAMPLE_BOOST_EVENTS)


def active_boost_events(kind: str) -> list[dict[str, object]]:
    return [
        event
        for event in configured_boost_events()
        if event_is_active(event) and event_applies(event, kind) and first_n_available(event, kind)
    ]


def award_boost_bonus(*, user_id: str, reward_kind: str, base_amount: int, idempotency_key: str, metadata: dict[str, object]) -> int:
    total_bonus = 0
    applied: list[dict[str, object]] = []
    for event in active_boost_events(reward_kind):
        multiplier = float(event.get("multiplier") or 1)
        bonus = int(event.get("bonus_credits") or 0)
        if multiplier > 1:
            bonus += max(0, int(round(base_amount * (multiplier - 1))))
        if bonus <= 0:
            continue
        event_id = str(event.get("id"))
        try:
            state.ledger.append(
                user_id=user_id,
                amount=bonus,
                transaction_type=LedgerType.credit_boost_bonus,
                related_quest_id=str(metadata.get("related_quest_id") or ""),
                idempotency_key=f"boost:{event_id}:{idempotency_key}",
                metadata={**metadata, "source": "credit_boost", "event_id": event_id, "event_title": event.get("title"), "reward_kind": reward_kind},
            )
        except ValueError as exc:
            if "duplicate ledger transaction" not in str(exc):
                raise
            continue
        total_bonus += bonus
        applied.append({"id": event_id, "title": event.get("title"), "bonus_credits": bonus})
    if applied:
        add_notification(user_id, "Credit boost applied", f"{total_bonus} bonus credits added from active DevQuest boost events.")
    return total_bonus


def configured_boost_events() -> list[dict[str, object]]:
    raw = os.getenv("DEVQUEST_CREDIT_BOOST_EVENTS", "").strip()
    if not raw:
        return []
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(payload, list):
        return []
    return [normalize_event(item) for item in payload if isinstance(item, dict)]


def normalize_event(item: dict[str, Any]) -> dict[str, object]:
    return {
        "id": str(item.get("id") or item.get("title") or "boost").strip().lower().replace(" ", "-"),
        "title": str(item.get("title") or "Credit boost"),
        "description": str(item.get("description") or "Limited-time credit boost event."),
        "kind": str(item.get("kind") or "all"),
        "multiplier": float(item.get("multiplier") or 1),
        "bonus_credits": int(item.get("bonus_credits") or 0),
        "first_n": item.get("first_n"),
        "starts_at": item.get("starts_at"),
        "ends_at": item.get("ends_at"),
    }


def event_is_active(event: dict[str, object]) -> bool:
    now = datetime.utcnow()
    starts_at = parse_datetime(event.get("starts_at"))
    ends_at = parse_datetime(event.get("ends_at"))
    if starts_at and now < starts_at:
        return False
    if ends_at and now > ends_at:
        return False
    return True


def event_applies(event: dict[str, object], kind: str) -> bool:
    event_kind = str(event.get("kind") or "all")
    return event_kind in {"all", kind}


def first_n_available(event: dict[str, object], kind: str) -> bool:
    first_n = event.get("first_n")
    if first_n is None:
        return True
    try:
        limit = int(first_n)
    except (TypeError, ValueError):
        return True
    if kind == "pull_request":
        completed = len([reward for reward in state.pull_request_rewards.values() if reward.reward_awarded])
    elif kind in {"issue_bounty", "fix_issue", "add_test", "write_docs", "example_integration"}:
        completed = len([reward for reward in state.issue_bounty_rewards.values() if reward.reward_awarded])
    else:
        completed = 0
    return completed < limit


def parse_datetime(value: object) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None
