from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from .. import state
from ..deps import add_notification, require_user
from ..models import GitHubUser, LedgerType, MarketplacePurchaseInput

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])

MARKETPLACE_ITEMS = [
    {
        "id": "model_api_calls",
        "title": "Model API calls",
        "description": "Spend credits automatically when your API keys call /v1/responses or /v1/chat/completions.",
        "cost_credits": 2,
        "unit": "per request",
        "status": "metered",
        "href": "/app/api-keys",
    },
    {
        "id": "automation_runs",
        "title": "Automation runs",
        "description": "Run DevQuest automation workflows with AI actions and integrations.",
        "cost_credits": 1,
        "unit": "per run",
        "status": "metered",
        "href": "/app/workflows",
    },
    {
        "id": "codex_provider_usage",
        "title": "Codex provider usage",
        "description": "Use your DevQuest key from Codex CLI or the IDE extension through /v1/responses.",
        "cost_credits": 2,
        "unit": "per request",
        "status": "metered",
        "href": "/app/docs",
    },
    {
        "id": "workflow_execution_pack",
        "title": "Workflow execution pack",
        "description": "Prepay for 25 workflow executions from your wallet.",
        "cost_credits": 25,
        "unit": "25 runs",
        "status": "available",
        "href": "/app/workflows",
    },
    {
        "id": "priority_model_access",
        "title": "Priority model access",
        "description": "Reserve priority access for high-demand model windows.",
        "cost_credits": 150,
        "unit": "24 hours",
        "status": "available",
        "href": "/app/playground",
    },
    {
        "id": "gpu_training_minutes",
        "title": "GPU training minutes",
        "description": "Future Azure GPU training time for model experiments.",
        "cost_credits": 500,
        "unit": "coming soon",
        "status": "coming_soon",
        "href": "/app",
    },
]


@router.get("")
async def marketplace(user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    purchases = [
        record.model_dump(mode="json")
        for record in state.ledger.records
        if record.user_id == user.id and record.type == LedgerType.marketplace_purchase
    ]
    return {
        "balance": state.ledger.balance(user.id),
        "items": MARKETPLACE_ITEMS,
        "purchases": purchases[::-1],
    }


@router.post("/purchase")
async def purchase_marketplace_item(input: MarketplacePurchaseInput, user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    item = next((candidate for candidate in MARKETPLACE_ITEMS if candidate["id"] == input.item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="marketplace item not found")
    if item["status"] != "available":
        raise HTTPException(status_code=409, detail="this marketplace item is not directly purchasable")
    cost = int(item["cost_credits"])
    if state.ledger.balance(user.id) < cost:
        raise HTTPException(status_code=402, detail="not enough credits")
    purchase_id = f"mp_{uuid4().hex[:12]}"
    record = state.ledger.append(
        user_id=user.id,
        amount=-cost,
        transaction_type=LedgerType.marketplace_purchase,
        related_request_id=purchase_id,
        idempotency_key=f"marketplace:{user.id}:{purchase_id}",
        metadata={"source": "marketplace", "item_id": item["id"], "item_title": item["title"], "unit": item["unit"]},
    )
    add_notification(user.id, "Marketplace purchase complete", f"{cost} credits spent on {item['title']}.")
    return {"purchase": record.model_dump(mode="json"), "balance": state.ledger.balance(user.id)}
