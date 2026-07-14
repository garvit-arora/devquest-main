from __future__ import annotations

import logging
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response
from fastapi.responses import RedirectResponse

from .. import state
from ..config import OAUTH_STATE_COOKIE, REFERRAL_CLICK_COOKIE, REFERRAL_COOKIE, SESSION_COOKIE, settings
from ..deps import require_user
from ..models import GitHubUser
from ..security import sign_session
from ..services.audit import record_platform_log
from ..services.referrals import award_referral_click_if_eligible
from ..user_store import delete_github_user, save_github_user

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)


def oauth_error_redirect(error: str, description: str | None = None) -> RedirectResponse:
    query = {"oauth_error": error}
    if description:
        query["oauth_detail"] = description[:160]
    return RedirectResponse(f"{settings.app_url}/signin?{urlencode(query)}")


def log_oauth_failure(stage: str, detail: str) -> None:
    message = f"{stage}: {detail[:500]}"
    logger.error("GitHub OAuth failure - %s", message)
    record_platform_log("error", "github_oauth_failure", message, {"stage": stage})


@router.get("/github/login")
async def github_login(ref: str | None = None) -> RedirectResponse:
    if not settings.github_client_id:
        raise HTTPException(status_code=500, detail="GITHUB_CLIENT_ID is not configured")
    state_value = secrets.token_urlsafe(32)
    query = urlencode(
        {
            "client_id": settings.github_client_id,
            "redirect_uri": f"{settings.api_url}/api/auth/github/callback",
            "scope": "read:user user:email public_repo",
            "state": state_value,
            "allow_signup": "true",
        }
    )
    response = RedirectResponse(f"https://github.com/login/oauth/authorize?{query}")
    response.set_cookie(OAUTH_STATE_COOKIE, state_value, httponly=True, secure=settings.secure_cookie, samesite="lax", max_age=600)
    if ref:
        response.set_cookie(REFERRAL_COOKIE, ref[:80], httponly=True, secure=settings.secure_cookie, samesite="lax", max_age=60 * 60 * 24 * 14)
    return response


@router.get("/github/callback")
async def github_callback(
    code: str,
    oauth_state: str = Query(alias="state"),
    devquest_oauth_state: str | None = Cookie(default=None),
    devquest_referral_click: str | None = Cookie(default=None, alias=REFERRAL_CLICK_COOKIE),
) -> RedirectResponse:
    if not devquest_oauth_state or not secrets.compare_digest(oauth_state, devquest_oauth_state):
        return oauth_error_redirect("invalid_state")
    if not settings.github_client_id or not settings.github_client_secret:
        return oauth_error_redirect("missing_credentials")

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            token_response = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                data={
                    "client_id": settings.github_client_id,
                    "client_secret": settings.github_client_secret,
                    "code": code,
                    "redirect_uri": f"{settings.api_url}/api/auth/github/callback",
                },
            )
            if token_response.status_code >= 400:
                log_oauth_failure("token_http", f"status={token_response.status_code} body={token_response.text}")
                return oauth_error_redirect("github_token_http_error", f"GitHub token endpoint returned {token_response.status_code}.")
            token_payload = token_response.json()
            if token_payload.get("error"):
                error = str(token_payload.get("error", "github_token_error"))
                description = str(token_payload.get("error_description", error))
                log_oauth_failure("token_payload", f"{error}: {description}")
                return oauth_error_redirect(error, description)
            access_token = token_payload.get("access_token")
            if not access_token:
                log_oauth_failure("token_missing", str(token_payload))
                return oauth_error_redirect("token_missing", "GitHub did not return an access token.")

            user_response = await client.get("https://api.github.com/user", headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"})
            if user_response.status_code >= 400:
                log_oauth_failure("user_http", f"status={user_response.status_code} body={user_response.text}")
                return oauth_error_redirect("github_user_fetch_failed", f"GitHub user endpoint returned {user_response.status_code}.")
            github_profile = user_response.json()

            emails_response = await client.get("https://api.github.com/user/emails", headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"})
            primary_email = None
            if emails_response.status_code == 200:
                emails = emails_response.json()
                primary_email = next((email.get("email") for email in emails if email.get("primary") and email.get("verified") and email.get("email")), None)

        existing_user = state.github_users.get(f"github:{github_profile['id']}")
        user = GitHubUser(
            id=f"github:{github_profile['id']}",
            github_id=github_profile["id"],
            login=github_profile["login"],
            name=github_profile.get("name"),
            email=primary_email or github_profile.get("email"),
            avatar_url=github_profile.get("avatar_url"),
            html_url=github_profile.get("html_url"),
            account_role=existing_user.account_role if existing_user else "developer",
            sponsor_name=existing_user.sponsor_name if existing_user else None,
            developer_level=existing_user.developer_level if existing_user else "rookie",
        )
        is_new_user = user.id not in state.github_users
        state.github_users[user.id] = user
        state.github_tokens[user.id] = access_token
        save_github_user(user, access_token)
        award_referral_click_if_eligible(devquest_referral_click, user, is_new_user=is_new_user)

        response = RedirectResponse(f"{settings.app_url}/app")
        response.set_cookie(SESSION_COOKIE, sign_session(user.model_dump()), httponly=True, secure=settings.secure_cookie, samesite="lax", max_age=60 * 60 * 24 * 7)
        response.delete_cookie(OAUTH_STATE_COOKIE)
        response.delete_cookie(REFERRAL_COOKIE)
        response.delete_cookie(REFERRAL_CLICK_COOKIE)
        return response
    except Exception as exc:
        log_oauth_failure("callback_exception", repr(exc))
        logger.exception("GitHub OAuth callback failed")
        return oauth_error_redirect("github_exchange_failed", exc.__class__.__name__)


@router.post("/logout")
async def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(SESSION_COOKIE)
    return {"status": "signed_out"}


@router.delete("/account")
async def delete_account(response: Response, user: GitHubUser = Depends(require_user)) -> dict[str, str]:
    state.github_users.pop(user.id, None)
    state.github_tokens.pop(user.id, None)
    delete_github_user(user.id)
    response.delete_cookie(SESSION_COOKIE)
    return {"status": "deleted"}


@router.get("/me")
async def me(user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    return {"user": user.model_dump(), "credits": state.ledger.balance(user.id)}
