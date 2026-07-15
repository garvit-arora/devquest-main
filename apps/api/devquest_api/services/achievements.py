from __future__ import annotations

from .. import state
from ..deps import add_notification
from ..models import LedgerType

ACHIEVEMENTS = {
    "first_api_request": {
        "title": "First API request",
        "description": "Make the first successful DevQuest API call.",
        "reward_credits": 0,
    },
    "first_codex_setup": {
        "title": "First Codex setup",
        "description": "Use DevQuest through the Codex-compatible /v1/responses endpoint.",
        "reward_credits": 0,
    },
    "first_workflow_run": {
        "title": "First workflow run",
        "description": "Run your first automation workflow.",
        "reward_credits": 25,
    },
    "first_100_successful_requests": {
        "title": "First 100 successful requests",
        "description": "Reach 100 successful API requests.",
        "reward_credits": 0,
    },
    "first_automation_published": {
        "title": "First automation published",
        "description": "Publish your first automation workflow.",
        "reward_credits": 75,
    },
}


def achievement_summary(user_id: str) -> dict[str, object]:
    awarded = awarded_achievement_ids(user_id)
    return {
        "data": [
            {
                "id": achievement_id,
                **achievement,
                "unlocked": achievement_id in awarded,
            }
            for achievement_id, achievement in ACHIEVEMENTS.items()
        ],
        "unlocked_count": len(awarded),
        "total_count": len(ACHIEVEMENTS),
    }


def award_api_usage_achievements(user_id: str, *, model: str, api_kind: str, status: int) -> None:
    if status >= 400:
        return
    award_achievement(user_id, "first_api_request", {"source": "achievement", "api_kind": api_kind, "model": model})
    if api_kind == "responses" or "code" in model.lower() or "codex" in model.lower():
        award_achievement(user_id, "first_codex_setup", {"source": "achievement", "api_kind": api_kind, "model": model})
    successful_requests = len([record for record in state.api_request_logs if record.get("user_id") == user_id and int(record.get("status", 0)) < 400])
    if successful_requests >= 100:
        award_achievement(user_id, "first_100_successful_requests", {"source": "achievement", "successful_requests": successful_requests})


def award_workflow_run_achievement(user_id: str, workflow_id: str) -> None:
    award_achievement(user_id, "first_workflow_run", {"source": "achievement", "workflow_id": workflow_id})


def award_workflow_published_achievement(user_id: str, workflow_id: str) -> None:
    award_achievement(user_id, "first_automation_published", {"source": "achievement", "workflow_id": workflow_id})


def award_achievement(user_id: str, achievement_id: str, metadata: dict[str, object] | None = None) -> None:
    achievement = ACHIEVEMENTS.get(achievement_id)
    if not achievement or achievement_id in awarded_achievement_ids(user_id):
        return
    credits = int(achievement["reward_credits"])
    try:
        state.ledger.append(
            user_id=user_id,
            amount=credits,
            transaction_type=LedgerType.achievement_reward,
            idempotency_key=f"achievement:{user_id}:{achievement_id}",
            metadata={**(metadata or {}), "achievement_id": achievement_id, "achievement_title": achievement["title"]},
        )
    except ValueError as exc:
        if "duplicate ledger transaction" not in str(exc):
            raise
        return
    if credits > 0:
        add_notification(user_id, "Achievement unlocked", f"{achievement['title']} added {credits} credits.")
    else:
        add_notification(user_id, "Achievement unlocked", f"{achievement['title']} is now complete.")


def awarded_achievement_ids(user_id: str) -> set[str]:
    return {
        str(record.metadata.get("achievement_id"))
        for record in state.ledger.records
        if record.user_id == user_id and record.type == LedgerType.achievement_reward and record.status == "settled"
    }
