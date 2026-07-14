from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from .. import state
from ..deps import add_notification, public_key, require_user
from ..key_store import save_api_key
from ..models import ApiKeyCreate, ApiKeyCreated, ApiKeyPublic, ApiKeyRename, GitHubUser
from ..config import settings
from ..providers import MODEL_REGISTRY, public_model_ids
from ..security import KeyRecord, generate_api_key, hash_api_key
from ..services.entitlements import refresh_user_repository_status, repository_access_error

router = APIRouter(prefix="/api/api-keys", tags=["api-keys"])


@router.post("", response_model=ApiKeyCreated)
async def create_api_key(input: ApiKeyCreate, user: GitHubUser = Depends(require_user)) -> ApiKeyCreated:
    entitlements = await refresh_user_repository_status(user, include_untracked=True, force_refresh=True)
    if not any(item.user_id == user.id and item.status == "verified" for item in entitlements):
        raise repository_access_error()
    balance = state.ledger.balance(user.id)
    if balance <= 0:
        raise HTTPException(status_code=402, detail="prompt credits are required before creating an API key")
    if len([key for key in state.api_keys.values() if key.user_id == user.id and key.status == "active"]) >= 5:
        raise HTTPException(status_code=429, detail="maximum active key count reached")
    models = list(dict.fromkeys(input.models))
    if not models:
        raise HTTPException(status_code=400, detail="choose one model for this API key")
    max_models = min(settings.max_models_per_key, 1)
    if len(models) > max_models:
        raise HTTPException(status_code=400, detail="choose only one model per API key")
    public_ids = set(public_model_ids())
    invalid = [model for model in models if model not in MODEL_REGISTRY or model not in public_ids]
    if invalid:
        raise HTTPException(status_code=400, detail=f"model aliases are not available for keys: {', '.join(invalid)}")
    if input.spending_limit <= 0:
        raise HTTPException(status_code=400, detail="credit limit must be greater than zero")
    spending_limit = min(input.spending_limit, balance)
    raw = generate_api_key()
    record = KeyRecord(
        id=f"key_{uuid4().hex[:12]}",
        user_id=user.id,
        name=input.name,
        prefix=raw[:12],
        key_hash=hash_api_key(raw),
        environment=input.environment,
        models=models,
        spending_limit=spending_limit,
    )
    state.api_keys[record.prefix] = record
    save_api_key(record)
    add_notification(user.id, "API key created", f"{record.name} can now call the DevQuest gateway if repository access is active.")
    return ApiKeyCreated(raw_key=raw, record=public_key(record))


@router.get("", response_model=list[ApiKeyPublic])
async def list_api_keys(user: GitHubUser = Depends(require_user)) -> list[ApiKeyPublic]:
    return [public_key(record) for record in state.api_keys.values() if record.user_id == user.id]


@router.patch("/{key_id}", response_model=ApiKeyPublic)
async def rename_api_key(key_id: str, input: ApiKeyRename, user: GitHubUser = Depends(require_user)) -> ApiKeyPublic:
    for record in state.api_keys.values():
        if record.id == key_id and record.user_id == user.id:
            record.name = input.name
            save_api_key(record)
            return public_key(record)
    raise HTTPException(status_code=404, detail="key not found")


@router.post("/{key_id}/rotate", response_model=ApiKeyCreated)
async def rotate_api_key(key_id: str, user: GitHubUser = Depends(require_user)) -> ApiKeyCreated:
    for old_prefix, record in list(state.api_keys.items()):
        if record.id == key_id and record.user_id == user.id:
            raw = generate_api_key()
            state.api_keys.pop(old_prefix)
            record.prefix = raw[:12]
            record.key_hash = hash_api_key(raw)
            record.status = "active"
            state.api_keys[record.prefix] = record
            save_api_key(record)
            return ApiKeyCreated(raw_key=raw, record=public_key(record))
    raise HTTPException(status_code=404, detail="key not found")


@router.delete("/{key_id}", response_model=ApiKeyPublic)
async def revoke_api_key(key_id: str, user: GitHubUser = Depends(require_user)) -> ApiKeyPublic:
    for record in state.api_keys.values():
        if record.id == key_id and record.user_id == user.id:
            record.status = "revoked"
            save_api_key(record)
            return public_key(record)
    raise HTTPException(status_code=404, detail="key not found")
