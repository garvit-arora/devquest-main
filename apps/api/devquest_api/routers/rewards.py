from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import state
from ..deps import require_user
from ..models import GitHubUser
from ..services.achievements import achievement_summary
from ..services.boosts import boost_events

router = APIRouter(prefix="/api", tags=["rewards"])


@router.get("/boost-events")
async def list_boost_events() -> dict[str, object]:
    events = boost_events()
    return {
        "data": events,
        "active_count": len([event for event in events if event.get("status") == "active"]),
    }


@router.get("/achievements")
async def list_achievements(user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    summary = achievement_summary(user.id)
    return {
        **summary,
        "balance": state.ledger.balance(user.id),
    }
