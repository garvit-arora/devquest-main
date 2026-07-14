from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, Request

from .. import state
from ..activity_store import save_webhook_delivery
from ..security import verify_github_signature

router = APIRouter(tags=["webhooks"])


@router.post("/webhooks/github")
async def github_webhook(request: Request, x_hub_signature_256: str | None = Header(default=None), x_github_delivery: str | None = Header(default=None)) -> dict[str, str]:
    body = await request.body()
    if not verify_github_signature(body, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="invalid signature")
    if not x_github_delivery:
        raise HTTPException(status_code=400, detail="missing delivery id")
    if x_github_delivery in state.webhook_deliveries:
        return {"status": "duplicate_ignored"}
    state.webhook_deliveries.add(x_github_delivery)
    save_webhook_delivery(x_github_delivery)
    return {"status": "accepted"}
