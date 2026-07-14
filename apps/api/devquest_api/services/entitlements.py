from __future__ import annotations

import asyncio
from datetime import timedelta

import httpx
from fastapi import HTTPException

from .. import state
from ..azure_services import enqueue_star_verification
from ..config import STAR_RECHECK_SECONDS
from ..deps import add_notification, now_utc
from ..models import ApprovedRepository, GitHubUser, LedgerType, RepositoryEntitlement, RepositoryView
from ..repository_store import load_repository_campaigns, save_repository_entitlement


def entitlement_key(user_id: str, repository_id: str) -> str:
    return f"{user_id}:{repository_id}"


def repository_view(user_id: str, repo: ApprovedRepository) -> RepositoryView:
    entitlement = state.entitlements.get(entitlement_key(user_id, repo.id))
    if not entitlement:
        return RepositoryView(repository=repo, verification_status="pending", user_star_status="not_starred")
    user_star_status = "starred" if entitlement.status == "verified" else "not_starred"
    if entitlement.status in {"pending", "github_rate_limited", "verification_failed", "temporarily_unavailable"}:
        user_star_status = "verification_pending"
    return RepositoryView(
        repository=repo,
        verification_status=entitlement.status,
        user_star_status=user_star_status,
        reward_awarded=entitlement.reward_awarded,
        last_verified_at=entitlement.last_verified_at,
        next_verification_at=entitlement.next_verification_at,
    )


def sync_repository_campaigns_from_database() -> None:
    try:
        campaigns = load_repository_campaigns()
    except Exception:
        return
    if not campaigns:
        return
    state.repositories.clear()
    state.repositories.update({repo.id: repo for repo in campaigns})


async def check_github_star(user: GitHubUser, repo: ApprovedRepository) -> str:
    token = state.github_tokens.get(user.id)
    if not token:
        return "temporarily_unavailable"
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"https://api.github.com/user/starred/{repo.owner}/{repo.name}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        )
    if response.status_code == 204:
        return "verified"
    if response.status_code == 404:
        return "unstarred"
    if response.status_code in {403, 429}:
        return "github_rate_limited"
    return "verification_failed"


async def verify_repository_star(user: GitHubUser, repo: ApprovedRepository) -> RepositoryEntitlement:
    key = entitlement_key(user.id, repo.id)
    current = state.entitlements.get(key) or RepositoryEntitlement(user_id=user.id, repository_id=repo.id, reward_credits=repo.reward_credits)
    previous_status = current.status
    result = await check_github_star(user, repo)
    current.last_verified_at = now_utc()
    current.next_verification_at = now_utc() + timedelta(seconds=STAR_RECHECK_SECONDS)

    if result == "verified":
        current.status = "verified"
        current.last_error = None
        reward_idempotency_key = f"repo-star:{user.id}:{repo.id}"
        if not current.reward_awarded and reward_idempotency_key not in state.ledger.idempotency_keys:
            state.ledger.append(
                user_id=user.id,
                amount=repo.reward_credits,
                transaction_type=LedgerType.repository_star_reward,
                related_quest_id=repo.id,
                idempotency_key=reward_idempotency_key,
                metadata={
                    "repository": repo.id,
                    "owner": repo.owner,
                    "name": repo.name,
                    "source": "sponsor" if repo.sponsor_name else "repository",
                    "sponsor_name": repo.sponsor_name,
                },
            )
            current.reward_awarded = True
            add_notification(user.id, "Repository star verified", f"{repo.reward_credits} prompt credits awarded for {repo.owner}/{repo.name}.")
        else:
            current.reward_awarded = True
    elif result == "unstarred":
        current.status = "unstarred"
        current.last_error = None
        if previous_status == "verified":
            add_notification(user.id, "Repository star removed", "API access may be blocked until an approved repository is starred again.")
    else:
        if current.status not in {"verified", "unstarred"}:
            current.status = result
        current.last_error = result

    state.entitlements[key] = current
    save_repository_entitlement(current)
    await enqueue_star_verification({"user_id": user.id, "repository_id": repo.id, "next_check_at": current.next_verification_at.isoformat()})
    return current


async def refresh_user_repository_status(user: GitHubUser, *, include_untracked: bool = False, force_refresh: bool = False) -> list[RepositoryEntitlement]:
    sync_repository_campaigns_from_database()
    candidates: list[ApprovedRepository] = []
    for repo in state.repositories.values():
        entitlement = state.entitlements.get(entitlement_key(user.id, repo.id))
        if repo.status != "active":
            continue
        if include_untracked:
            candidates.append(repo)
            continue
        if entitlement and entitlement.status == "verified":
            candidates.append(repo)

    due: list[ApprovedRepository] = []
    for repo in candidates:
        entitlement = state.entitlements.get(entitlement_key(user.id, repo.id))
        if force_refresh or not entitlement or not entitlement.next_verification_at or entitlement.next_verification_at <= now_utc():
            due.append(repo)

    if not due:
        return [item for item in state.entitlements.values() if item.user_id == user.id]

    return await asyncio.gather(*(verify_repository_star(user, repo) for repo in due))


async def ensure_repository_access(user_id: str, *, force_refresh: bool = False) -> None:
    sync_repository_campaigns_from_database()
    if not state.repositories:
        raise repository_access_error()
    user = state.github_users.get(user_id)
    if not user:
        raise repository_access_error()

    await refresh_user_repository_status(user, include_untracked=force_refresh, force_refresh=force_refresh)

    if any(item.user_id == user_id and item.status == "verified" for item in state.entitlements.values()):
        return
    raise repository_access_error()


def repository_access_error() -> HTTPException:
    return HTTPException(
        status_code=403,
        detail={
            "error": {
                "message": "API access is inactive because no eligible DevQuest repository is currently starred.",
                "type": "repository_access_inactive",
                "code": "repository_star_required",
            }
        },
    )
