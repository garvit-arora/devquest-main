from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import Cookie, HTTPException

from .config import SESSION_COOKIE
from .models import ApiKeyPublic, GitHubUser
from .models import LedgerType
from .security import KeyRecord, verify_session
from . import state
from .activity_store import save_notification
from .azure_services import dispatch_user_notification


def now_utc() -> datetime:
    return datetime.utcnow()


def public_key(record: KeyRecord) -> ApiKeyPublic:
    credits_used = sum(
        abs(item.amount)
        for item in state.ledger.records
        if item.type == LedgerType.api_usage_settled and item.metadata.get("key_prefix") == record.prefix
    )
    return ApiKeyPublic(
        **record.__dict__,
        credits_used=credits_used,
        remaining_credit_limit=max(0, record.spending_limit - credits_used),
    )


def add_notification(user_id: str, title: str, detail: str) -> None:
    notification = {
        "id": f"ntf_{uuid4().hex[:12]}",
        "title": title,
        "detail": detail,
        "created_at": now_utc().isoformat(),
    }
    state.notifications[user_id].insert(0, notification)
    save_notification(user_id, notification)
    user = state.github_users.get(user_id)
    dispatch_user_notification(user.model_dump() if user else None, notification)


def require_user(devquest_session: str | None = Cookie(default=None, alias=SESSION_COOKIE)) -> GitHubUser:
    payload = verify_session(devquest_session)
    if not payload:
        raise HTTPException(status_code=401, detail="not authenticated")
    user_id = str(payload.get("id", ""))
    user = state.github_users.get(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="session user not found")
    return user


def optional_user(devquest_session: str | None = Cookie(default=None, alias=SESSION_COOKIE)) -> GitHubUser | None:
    payload = verify_session(devquest_session)
    if not payload:
        return None
    user_id = str(payload.get("id", ""))
    return state.github_users.get(user_id)
