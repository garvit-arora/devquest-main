from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .. import state
from ..deps import optional_user, require_user
from ..models import AdminUser, ApprovedRepository, GitHubUser, RepositoryCampaignCreate, RepositoryView
from ..repositories import REPOSITORY_STAR_REWARD_CREDITS
from ..repository_store import save_repository_campaign
from ..services.entitlements import refresh_user_repository_status, repository_view, sync_repository_campaigns_from_database, verify_repository_star
from .admin import require_admin

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("")
async def list_projects(user: GitHubUser | None = Depends(optional_user)) -> dict[str, object]:
    sync_repository_campaigns_from_database()
    if user:
        await refresh_user_repository_status(user, include_untracked=True, force_refresh=True)
        return {"data": [repository_view(user.id, repo).model_dump(mode="json") for repo in state.repositories.values()]}
    return {"data": [RepositoryView(repository=repo, verification_status="incomplete", user_star_status="not_starred").model_dump(mode="json") for repo in state.repositories.values()]}


@router.post("/admin")
async def create_repository_campaign(input: RepositoryCampaignCreate, _admin: AdminUser = Depends(require_admin)) -> dict[str, object]:
    owner = input.owner.strip()
    name = input.name.strip()
    repo = ApprovedRepository(
        id=f"{owner.lower()}/{name.lower()}",
        owner=owner,
        name=name,
        url=input.url or f"https://github.com/{owner}/{name}",
        description=input.description,
        avatar_url=input.avatar_url,
        reward_credits=REPOSITORY_STAR_REWARD_CREDITS,
        current_star_count=input.current_star_count,
        star_target=input.star_target,
        target_bonus_calls=input.target_bonus_calls,
        total_campaign_credits=input.total_campaign_credits,
        campaign_start_date=input.campaign_start_date,
        campaign_end_date=input.campaign_end_date,
        status=input.status,
        sponsor_name=input.sponsor_name,
    )
    state.repositories[repo.id] = repo
    save_repository_campaign(repo)
    return repo.model_dump(mode="json")


@router.post("/{repository_id:path}/verify")
async def verify_project(repository_id: str, user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    repo = state.repositories.get(repository_id)
    if not repo:
        raise HTTPException(status_code=404, detail="repository not configured")
    if repo.status != "active":
        raise HTTPException(status_code=409, detail="repository campaign is not active")
    entitlement = await verify_repository_star(user, repo)
    return {"project": repository_view(user.id, repo).model_dump(mode="json"), "entitlement": entitlement.model_dump(mode="json"), "balance": state.ledger.balance(user.id)}


@router.post("/refresh")
async def refresh_projects(user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    entitlements = await refresh_user_repository_status(user, include_untracked=True, force_refresh=True)
    return {
        "verified_repository_count": len([item for item in entitlements if item.user_id == user.id and item.status == "verified"]),
        "balance": state.ledger.balance(user.id),
    }
