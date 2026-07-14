from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response

from .. import state
from ..admin_store import verify_admin_password
from ..config import ADMIN_SESSION_COOKIE, settings
from ..models import AdminLogin, AdminUser, LedgerType, UserRoleUpdate
from ..security import sign_session, verify_session
from ..services.audit import record_platform_log
from ..user_store import save_github_user

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin(devquest_admin_session: str | None = Cookie(default=None, alias=ADMIN_SESSION_COOKIE)) -> AdminUser:
    payload = verify_session(devquest_admin_session)
    if not payload or payload.get("admin") is not True:
        raise HTTPException(status_code=401, detail="admin authentication required")
    username = str(payload.get("username", ""))
    admin = state.admin_users.get(username)
    if not admin:
        raise HTTPException(status_code=401, detail="admin user not found")
    return admin


@router.post("/login")
async def admin_login(input: AdminLogin, response: Response) -> dict[str, object]:
    if not state.admin_users:
        record_platform_log("error", "admin_login_unconfigured", "Admin login attempted before admin credentials were configured.")
        raise HTTPException(status_code=503, detail="admin credentials are not configured")
    admin = state.admin_users.get(input.username)
    if not admin or not verify_admin_password(input.password, admin.password_hash):
        record_platform_log("warning", "admin_login_failed", "Admin login failed.", {"username": input.username})
        raise HTTPException(status_code=401, detail="invalid admin credentials")

    response.set_cookie(
        ADMIN_SESSION_COOKIE,
        sign_session({"admin": True, "username": admin.username, "role": admin.role}),
        httponly=True,
        secure=settings.secure_cookie,
        samesite="lax",
        max_age=60 * 60 * 8,
    )
    record_platform_log("info", "admin_login", "Admin signed in.", {"username": admin.username, "role": admin.role})
    return {"admin": admin.model_dump(exclude={"password_hash"}, mode="json")}


@router.post("/logout")
async def admin_logout(response: Response) -> dict[str, str]:
    response.delete_cookie(ADMIN_SESSION_COOKIE)
    return {"status": "signed_out"}


@router.get("/me")
async def admin_me(admin: AdminUser = Depends(require_admin)) -> dict[str, object]:
    return {"admin": admin.model_dump(exclude={"password_hash"}, mode="json")}


@router.get("/overview")
async def admin_overview(_admin: AdminUser = Depends(require_admin)) -> dict[str, object]:
    requests = list(state.api_request_logs)
    failures = [item for item in requests if int(item.get("status", 0)) >= 400]
    active_keys = [item for item in state.api_keys.values() if item.status == "active"]
    issued_credits = sum(record.amount for record in state.ledger.records if record.amount > 0 and record.status == "settled")
    spent_credits = sum(abs(record.amount) for record in state.ledger.records if record.type == LedgerType.api_usage_settled and record.status == "settled")
    quests_completed = len([item for item in state.entitlements.values() if item.status == "verified" and item.reward_awarded])
    environment = "production" if settings.app_url.startswith("https://") else "local"

    users = []
    for user in state.github_users.values():
        user_requests = [item for item in requests if item.get("user_id") == user.id]
        user_keys = [key for key in state.api_keys.values() if key.user_id == user.id]
        verified_repos = [item.repository_id for item in state.entitlements.values() if item.user_id == user.id and item.status == "verified"]
        ledger_spent = sum(abs(record.amount) for record in state.ledger.records if record.user_id == user.id and record.type == LedgerType.api_usage_settled)
        users.append(
            {
                "id": user.id,
                "login": user.login,
                "name": user.name,
                "email": user.email,
                "account_role": user.account_role,
                "sponsor_name": user.sponsor_name,
                "developer_level": user.developer_level,
                "credits": state.ledger.balance(user.id),
                "api_keys": len(user_keys),
                "active_api_keys": len([key for key in user_keys if key.status == "active"]),
                "requests": len(user_requests),
                "credits_used": ledger_spent,
                "verified_repositories": verified_repos,
            }
        )

    synthetic_failure_logs = [
        {
            "id": f"failure_{item.get('request_id', index)}",
            "timestamp": item.get("timestamp"),
            "level": "error",
            "event": "gateway_request_failed",
            "message": f"Gateway request failed with status {item.get('status')}",
            "metadata": item,
        }
        for index, item in enumerate(failures[-100:])
    ]

    return {
        "environment": environment,
        "log_source": "production application telemetry" if environment == "production" else "local application telemetry",
        "metrics": {
            "users": len(state.github_users),
            "active_api_keys": len(active_keys),
            "total_api_keys": len(state.api_keys),
            "requests": len(requests),
            "failed_requests": len(failures),
            "credits_issued": issued_credits,
            "credits_spent": spent_credits,
            "credits_used": spent_credits,
            "quests_completed": quests_completed,
            "repositories": len(state.repositories),
            "sponsor_submissions": len(state.sponsor_submissions),
            "successful_referrals": len([record for record in state.referrals.values() if record.status == "settled"]),
        },
        "users": users,
        "api_keys": [
            {
                "id": key.id,
                "name": key.name,
                "prefix": key.prefix,
                "user_id": key.user_id,
                "environment": key.environment,
                "models": key.models,
                "spending_limit": key.spending_limit,
                "status": key.status,
                "created_at": key.created_at,
                "last_used_at": key.last_used_at,
            }
            for key in state.api_keys.values()
        ],
        "logs": list(state.platform_logs)[:100] + synthetic_failure_logs[::-1],
        "model_usage": aggregate_admin_usage(requests, "model"),
        "top_api_keys": aggregate_admin_usage(requests, "key_prefix"),
        "failed_calls": failures[-100:][::-1],
    }


def aggregate_admin_usage(records: list[dict[str, object]], key: str) -> list[dict[str, object]]:
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
                "total_tokens": 0,
                "last_used_at": None,
            },
        )
        status = int(record.get("status", 0))
        current["requests"] = int(current["requests"]) + 1
        current["failed_requests"] = int(current["failed_requests"]) + (1 if status >= 400 else 0)
        current["credits"] = int(current["credits"]) + (int(record.get("credits", 0)) if status < 400 else 0)
        current["total_tokens"] = int(current["total_tokens"]) + int(record.get("total_tokens", 0))
        timestamp = str(record.get("timestamp") or "")
        if timestamp and (current["last_used_at"] is None or timestamp > str(current["last_used_at"])):
            current["last_used_at"] = timestamp
    return sorted(buckets.values(), key=lambda item: (int(item["requests"]), int(item["credits"])), reverse=True)[:10]


@router.patch("/users/{user_id}/role")
async def update_user_role(user_id: str, input: UserRoleUpdate, admin: AdminUser = Depends(require_admin)) -> dict[str, object]:
    user = state.github_users.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    user.account_role = input.account_role
    user.sponsor_name = input.sponsor_name.strip() if input.account_role == "sponsor" and input.sponsor_name else None
    state.github_users[user.id] = user
    save_github_user(user, state.github_tokens.get(user.id))
    record_platform_log(
        "info",
        "user_role_updated",
        f"Admin updated {user.login} role to {user.account_role}.",
        {"admin": admin.username, "user_id": user.id, "sponsor_name": user.sponsor_name},
    )
    return {"user": user.model_dump(mode="json")}


@router.get("/sponsor-campaigns")
async def admin_sponsor_campaigns(_admin: AdminUser = Depends(require_admin)) -> dict[str, object]:
    campaigns = []
    for repo in state.repositories.values():
        if not repo.sponsor_name:
            continue
        entitlements = [item for item in state.entitlements.values() if item.repository_id == repo.id]
        verified = [item for item in entitlements if item.status == "verified"]
        awarded = [item for item in verified if item.reward_awarded]
        submissions = [
            item
            for item in state.sponsor_submissions.values()
            if item.payload.sponsor_name.lower() == repo.sponsor_name.lower() or item.payload.repository_url.rstrip("/").lower() == repo.url.rstrip("/").lower()
        ]
        target_stars = repo.star_target or len(awarded)
        current_stars = repo.current_star_count if repo.current_star_count is not None else len(verified)
        cost_estimate = target_stars * repo.reward_credits
        awarded_credits = len(awarded) * repo.reward_credits
        campaigns.append(
            {
                "id": repo.id,
                "sponsor_name": repo.sponsor_name,
                "repository": f"{repo.owner}/{repo.name}",
                "repository_url": repo.url,
                "campaign_status": repo.status,
                "target_stars": target_stars,
                "current_stars": current_stars,
                "remaining_stars": max(0, target_stars - current_stars),
                "reward_credits": repo.reward_credits,
                "cost_estimate": cost_estimate,
                "awarded_credits": awarded_credits,
                "submissions": len(submissions),
                "pending_approval": len([item for item in submissions if item.status == "pending_review"]),
                "verified_users": len(verified),
                "campaign_start_date": repo.campaign_start_date,
                "campaign_end_date": repo.campaign_end_date,
            }
        )

    approved_urls = {repo.url.rstrip("/").lower() for repo in state.repositories.values()}
    pending_submissions = [
        {
            "id": item.id,
            "sponsor_name": item.payload.sponsor_name,
            "repository_url": item.payload.repository_url,
            "status": item.status,
            "created_at": item.created_at,
            "requested_user_target": item.payload.requested_user_target,
            "proposed_reward": item.payload.proposed_reward,
            "contact_name": item.payload.contact_name,
            "work_email": item.payload.work_email,
            "public_listing_consent": item.payload.public_listing_consent,
            "review_fee_amount_inr": item.payload.review_fee_amount_inr,
            "payment_transaction_id": item.payload.payment_transaction_id,
        }
        for item in state.sponsor_submissions.values()
        if item.status == "pending_review" and item.payload.repository_url.rstrip("/").lower() not in approved_urls
    ]

    return {
        "summary": {
            "active_campaigns": len([item for item in campaigns if item["campaign_status"] == "active"]),
            "total_campaigns": len(campaigns),
            "pending_approval": len(pending_submissions) + sum(int(item["pending_approval"]) for item in campaigns),
            "target_stars": sum(int(item["target_stars"]) for item in campaigns),
            "current_stars": sum(int(item["current_stars"]) for item in campaigns),
            "cost_estimate": sum(int(item["cost_estimate"]) for item in campaigns),
            "awarded_credits": sum(int(item["awarded_credits"]) for item in campaigns),
        },
        "campaigns": sorted(campaigns, key=lambda item: (str(item["campaign_status"]) != "active", str(item["sponsor_name"]).lower())),
        "pending_submissions": sorted(pending_submissions, key=lambda item: str(item["created_at"]), reverse=True),
    }
