from __future__ import annotations

from time import time
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from .. import state
from ..activity_store import save_api_request_log
from ..deps import add_notification, require_user
from ..models import AiToolRequest, ChatCompletionRequest, ChatMessage, GitHubUser
from ..providers import MODEL_REGISTRY, ProviderUnavailable, provider, public_models, request_credit_cost
from ..services.entitlements import ensure_repository_access

router = APIRouter(prefix="/api/ai-tools", tags=["ai-tools"])

TOOL_DEFINITIONS = {
    "prompt_optimizer": {
        "title": "Prompt Optimizer",
        "description": "Improve prompts for production AI calls with clearer instructions, constraints, output shape, and safety checks.",
        "system": "You are DevQuest AI Prompt Optimizer. Return a production-ready prompt, suggested model settings, risks, and a minimal API payload. Be concise and specific.",
    },
    "test_generator": {
        "title": "Test Generator",
        "description": "Turn feature notes or code behavior into focused unit, integration, and edge-case test plans.",
        "system": "You are DevQuest AI Test Generator. Return practical tests grouped by unit, integration, edge cases, and regression risk. Include concise pseudocode where useful.",
    },
    "workflow_blueprint": {
        "title": "Workflow Blueprint",
        "description": "Convert an automation idea into DevQuest workflow triggers, AI steps, data saves, and notifications.",
        "system": "You are DevQuest Workflow Architect. Return a JSON-like workflow blueprint with triggers, nodes, edges, credentials needed, and credit cost notes.",
    },
    "integration_snippet": {
        "title": "Integration Snippet",
        "description": "Generate a minimal DevQuest API integration snippet for apps, Codex, or backend services.",
        "system": "You are DevQuest Integration Engineer. Return a short explanation and code snippets using the DevQuest /v1/responses endpoint and DEVQUEST_API_KEY environment variable.",
    },
}


@router.get("")
async def list_ai_tools(user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    return {
        "balance": state.ledger.balance(user.id),
        "models": [model.model_dump(exclude={"upstream_model"}) for model in public_models()],
        "tools": [{"id": tool_id, **definition} for tool_id, definition in TOOL_DEFINITIONS.items()],
    }


@router.post("/run")
async def run_ai_tool(input: AiToolRequest, user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    await ensure_repository_access(user.id, force_refresh=True)
    tool = TOOL_DEFINITIONS.get(input.tool)
    if not tool:
        raise HTTPException(status_code=404, detail="AI tool not found")
    model_id = input.model or default_model_id()
    model = MODEL_REGISTRY.get(model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model alias not found")
    if model.availability in {"maintenance", "unconfigured"}:
        raise HTTPException(status_code=503, detail="Model provider is not configured for this alias")

    request_id = f"ait_{uuid4().hex[:12]}"
    cost = request_credit_cost(model)
    try:
        reserved = state.ledger.reserve(
            user_id=user.id,
            amount=cost,
            request_id=request_id,
            metadata={"kind": "ai_tool", "tool": input.tool, "model": model_id},
        )
    except ValueError as exc:
        raise HTTPException(status_code=402, detail="insufficient credits to run AI tool") from exc

    started = time()
    chat_request = ChatCompletionRequest(
        model=model_id,
        messages=[
            ChatMessage(role="system", content=str(tool["system"])),
            ChatMessage(role="user", content=user_prompt(input)),
        ],
        temperature=0.3,
        max_tokens=1600,
    )
    try:
        response = await provider.chat_completion(chat_request)
        state.ledger.settle(user_id=user.id, reserved=reserved, actual_amount=cost, request_id=request_id)
        text = chat_completion_text(response)
        log = {
            "timestamp": state.ledger.records[-1].created_at.isoformat() if state.ledger.records else "",
            "request_id": request_id,
            "key_prefix": "dashboard",
            "user_id": user.id,
            "model": model_id,
            "credits": cost,
            "prompt_tokens": int((response.get("usage") or {}).get("prompt_tokens", 0)) if isinstance(response.get("usage"), dict) else 0,
            "completion_tokens": int((response.get("usage") or {}).get("completion_tokens", 0)) if isinstance(response.get("usage"), dict) else 0,
            "total_tokens": int((response.get("usage") or {}).get("total_tokens", 0)) if isinstance(response.get("usage"), dict) else 0,
            "latency_ms": int((time() - started) * 1000),
            "status": 200,
            "api_kind": "ai_tool",
            "tool": input.tool,
        }
        state.api_request_logs.append(log)
        save_api_request_log(log)
        add_notification(user.id, "AI tool completed", f"{tool['title']} used {cost} credits.")
        return {
            "id": request_id,
            "tool": input.tool,
            "tool_title": tool["title"],
            "model": model_id,
            "credits_charged": cost,
            "output": text,
            "balance": state.ledger.balance(user.id),
            "usage": response.get("usage") if isinstance(response, dict) else None,
        }
    except ProviderUnavailable as exc:
        state.ledger.release(user_id=user.id, reserved=reserved, request_id=request_id, reason=str(exc))
        raise HTTPException(status_code=503, detail=str(exc)) from None


def default_model_id() -> str:
    models = public_models()
    available = next((model for model in models if model.availability == "available"), None)
    return (available or models[0]).id if models else "gpt-5.6-sol"


def user_prompt(input: AiToolRequest) -> str:
    parts = [f"Task input:\n{input.input.strip()}"]
    if input.context:
        parts.append(f"Additional context:\n{input.context.strip()}")
    return "\n\n".join(parts)


def chat_completion_text(response: dict[str, object]) -> str:
    choices = response.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            message = first.get("message")
            if isinstance(message, dict):
                return str(message.get("content") or "")
            text = first.get("text")
            if text:
                return str(text)
    return ""
