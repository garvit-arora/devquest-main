from __future__ import annotations

import asyncio
import json
from time import time
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse

from .. import state
from ..deps import now_utc
from ..key_store import save_api_key
from ..models import ChatCompletionRequest, ChatMessage, ResponsesCreateRequest
from ..providers import MODEL_REGISTRY, ProviderUnavailable, provider, public_models
from ..services.entitlements import ensure_repository_access
from ..services.gateway import authenticate_api_key, credits_for_response, enforce_key_credit_limit, enforce_rate_limits, estimated_request_credits, record_api_usage, validate_request_limits

router = APIRouter(prefix="/v1", tags=["gateway"])


@router.get("/models")
async def models() -> dict[str, object]:
    return {"object": "list", "data": [model.model_dump(exclude={"upstream_model"}) for model in public_models()]}


@router.post("/chat/completions")
async def chat_completions(request: ChatCompletionRequest, authorization: str | None = Header(default=None)):
    key = authenticate_api_key(authorization)
    await ensure_repository_access(key.user_id, force_refresh=True)
    enforce_rate_limits(key)
    validate_request_limits(request)
    model = MODEL_REGISTRY.get(request.model)
    if not model:
        raise HTTPException(status_code=404, detail={"error": {"message": "Model alias not found", "type": "invalid_request_error"}})
    if model.availability in {"maintenance", "unconfigured"}:
        raise HTTPException(status_code=503, detail={"error": {"message": "Model provider is not configured for this alias", "type": "model_unavailable"}})
    if request.model not in key.models:
        raise HTTPException(status_code=403, detail={"error": {"message": "Key is restricted from this model", "type": "permission_error"}})

    request_id = f"req_{uuid4().hex[:12]}"
    estimated = estimated_request_credits(request)
    enforce_key_credit_limit(key, estimated)
    try:
        reservation = state.ledger.reserve(user_id=key.user_id, amount=estimated, request_id=request_id, metadata={"model": request.model, "stream": request.stream, "key_prefix": key.prefix})
    except ValueError:
        raise HTTPException(status_code=402, detail={"error": {"message": "Insufficient credits", "type": "insufficient_quota"}}) from None

    state.active_requests[key.id] += 1
    started = time()
    key.last_used_at = now_utc().isoformat()
    save_api_key(key)
    try:
        if request.stream:
            async def stream():
                try:
                    async for chunk in provider.stream_chat_completion(request):
                        yield chunk
                    state.ledger.settle(user_id=key.user_id, reserved=reservation, actual_amount=estimated, request_id=request_id)
                    record_api_usage(key, request, request_id, estimated, started, 200)
                except ProviderUnavailable as exc:
                    state.ledger.release(user_id=key.user_id, reserved=reservation, request_id=request_id, reason=str(exc))
                    yield f"data: {{\"error\":{{\"message\":\"{str(exc)}\",\"type\":\"model_unavailable\"}}}}\n\n"
                finally:
                    state.active_requests[key.id] -= 1

            return StreamingResponse(stream(), media_type="text/event-stream")

        response = await provider.chat_completion(request)
        actual = credits_for_response(response, default=estimated)
        state.ledger.settle(user_id=key.user_id, reserved=reservation, actual_amount=actual, request_id=request_id)
        record_api_usage(key, request, request_id, actual, started, 200, response)
        return response
    except ProviderUnavailable as exc:
        state.ledger.release(user_id=key.user_id, reserved=reservation, request_id=request_id, reason=str(exc))
        record_api_usage(key, request, request_id, 0, started, 503)
        raise HTTPException(status_code=503, detail={"error": {"message": str(exc), "type": "model_unavailable"}}) from None
    finally:
        if not request.stream:
            state.active_requests[key.id] -= 1


@router.post("/responses")
async def responses(request: ResponsesCreateRequest, authorization: str | None = Header(default=None)):
    chat_request = responses_to_chat_request(request)
    key = authenticate_api_key(authorization)
    await ensure_repository_access(key.user_id, force_refresh=True)
    enforce_rate_limits(key)
    validate_request_limits(chat_request)
    model = MODEL_REGISTRY.get(chat_request.model)
    if not model:
        raise HTTPException(status_code=404, detail={"error": {"message": "Model alias not found", "type": "invalid_request_error"}})
    if model.availability in {"maintenance", "unconfigured"}:
        raise HTTPException(status_code=503, detail={"error": {"message": "Model provider is not configured for this alias", "type": "model_unavailable"}})
    if chat_request.model not in key.models:
        raise HTTPException(status_code=403, detail={"error": {"message": "Key is restricted from this model", "type": "permission_error"}})

    request_id = f"req_{uuid4().hex[:12]}"
    response_id = f"resp_{uuid4().hex[:24]}"
    estimated = estimated_request_credits(chat_request)
    enforce_key_credit_limit(key, estimated)
    try:
        reservation = state.ledger.reserve(user_id=key.user_id, amount=estimated, request_id=request_id, metadata={"model": chat_request.model, "stream": request.stream, "key_prefix": key.prefix, "api": "responses"})
    except ValueError:
        raise HTTPException(status_code=402, detail={"error": {"message": "Insufficient credits", "type": "insufficient_quota"}}) from None

    state.active_requests[key.id] += 1
    started = time()
    key.last_used_at = now_utc().isoformat()
    save_api_key(key)

    if request.stream:
        return StreamingResponse(
            stream_response_events(key, chat_request, request, response_id, request_id, reservation, estimated, started),
            media_type="text/event-stream",
        )

    try:
        provider_response = await provider.chat_completion(chat_request)
        actual = credits_for_response(provider_response, default=estimated)
        state.ledger.settle(user_id=key.user_id, reserved=reservation, actual_amount=actual, request_id=request_id)
        record_api_usage(key, chat_request, request_id, actual, started, 200, provider_response, api_kind="responses")
        text = chat_completion_text(provider_response)
        output = response_output_items(provider_response, text)
        return response_payload(response_id, request, text, provider_response.get("usage") if isinstance(provider_response, dict) else None, output=output)
    except ProviderUnavailable as exc:
        state.ledger.release(user_id=key.user_id, reserved=reservation, request_id=request_id, reason=str(exc))
        record_api_usage(key, chat_request, request_id, 0, started, 503, api_kind="responses")
        raise HTTPException(status_code=503, detail={"error": {"message": str(exc), "type": "model_unavailable"}}) from None
    finally:
        state.active_requests[key.id] -= 1


def responses_to_chat_request(request: ResponsesCreateRequest) -> ChatCompletionRequest:
    messages: list[ChatMessage] = []
    if request.instructions:
        messages.append(ChatMessage(role="system", content=request.instructions))
    messages.extend(response_input_to_messages(request.input))
    if not messages:
        messages.append(ChatMessage(role="user", content=""))
    return ChatCompletionRequest(
        model=request.model,
        messages=messages,
        stream=request.stream,
        temperature=request.temperature,
        max_tokens=request.max_output_tokens,
        tools=request.tools,
        tool_choice=request.tool_choice,
    )


def response_input_to_messages(input_value: str | list[Any] | None) -> list[ChatMessage]:
    if input_value is None:
        return []
    if isinstance(input_value, str):
        return [ChatMessage(role="user", content=input_value)]
    messages: list[ChatMessage] = []
    for item in input_value:
        if isinstance(item, str):
            messages.append(ChatMessage(role="user", content=item))
            continue
        if not isinstance(item, dict):
            messages.append(ChatMessage(role="user", content=str(item)))
            continue
        item_type = str(item.get("type", "message"))
        if item_type == "function_call_output":
            call_id = item.get("call_id") or item.get("id") or "tool"
            messages.append(ChatMessage(role="user", content=f"Tool output for {call_id}: {extract_response_text(item.get('output'))}"))
            continue
        role = str(item.get("role", "user"))
        if role not in {"system", "user", "assistant"}:
            role = "user"
        content = extract_response_text(item.get("content", item.get("text", item.get("output", ""))))
        if content:
            messages.append(ChatMessage(role=role, content=content))
    return messages


def extract_response_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("input_text") or item.get("output_text")
                if text:
                    parts.append(str(text))
                elif item.get("type") in {"input_image", "image"}:
                    parts.append("[image input omitted]")
            else:
                parts.append(str(item))
        return "\n".join(part for part in parts if part)
    if isinstance(value, dict):
        return str(value.get("text") or value.get("output") or json.dumps(value))
    return str(value)


async def stream_response_events(
    key,
    chat_request: ChatCompletionRequest,
    original_request: ResponsesCreateRequest,
    response_id: str,
    request_id: str,
    reservation,
    estimated: int,
    started: float,
):
    item_id = f"msg_{uuid4().hex[:16]}"
    content = ""
    yield sse("response.created", response_payload(response_id, original_request, "", None, status="in_progress", output=[]))
    yield sse("response.in_progress", {"response": response_payload(response_id, original_request, "", None, status="in_progress", output=[])})
    yield sse("response.output_item.added", {"response_id": response_id, "output_index": 0, "item": response_message_item(item_id, "", status="in_progress")})
    yield sse("response.content_part.added", {"response_id": response_id, "item_id": item_id, "output_index": 0, "content_index": 0, "part": {"type": "output_text", "text": "", "annotations": []}})
    try:
        async for chunk in provider.stream_chat_completion(chat_request):
            for delta in chat_stream_deltas(chunk):
                content += delta
                yield sse("response.output_text.delta", {"response_id": response_id, "item_id": item_id, "output_index": 0, "content_index": 0, "delta": delta})
        usage = estimated_usage(chat_request, content)
        actual = credits_for_response({"usage": usage}, default=estimated)
        state.ledger.settle(user_id=key.user_id, reserved=reservation, actual_amount=actual, request_id=request_id)
        record_api_usage(key, chat_request, request_id, actual, started, 200, {"usage": usage}, api_kind="responses")
        yield sse("response.output_text.done", {"response_id": response_id, "item_id": item_id, "output_index": 0, "content_index": 0, "text": content})
        yield sse("response.content_part.done", {"response_id": response_id, "item_id": item_id, "output_index": 0, "content_index": 0, "part": {"type": "output_text", "text": content, "annotations": []}})
        yield sse("response.output_item.done", {"response_id": response_id, "output_index": 0, "item": response_message_item(item_id, content)})
        yield sse("response.completed", {"response": response_payload(response_id, original_request, content, usage)})
        yield "data: [DONE]\n\n"
    except asyncio.CancelledError:
        state.ledger.release(user_id=key.user_id, reserved=reservation, request_id=request_id, reason="client_cancelled")
        record_api_usage(key, chat_request, request_id, 0, started, 499, api_kind="responses")
        raise
    except ProviderUnavailable as exc:
        state.ledger.release(user_id=key.user_id, reserved=reservation, request_id=request_id, reason=str(exc))
        record_api_usage(key, chat_request, request_id, 0, started, 503, api_kind="responses")
        yield sse("response.failed", {"response": response_payload(response_id, original_request, content, None, status="failed", error={"message": str(exc), "type": "model_unavailable"})})
        yield sse("error", {"error": {"message": str(exc), "type": "model_unavailable"}})
    finally:
        state.active_requests[key.id] -= 1


def chat_stream_deltas(chunk: str) -> list[str]:
    deltas: list[str] = []
    for line in chunk.splitlines():
        if not line.startswith("data:"):
            continue
        raw = line.removeprefix("data:").strip()
        if not raw or raw == "[DONE]":
            continue
        try:
            event = json.loads(raw)
        except json.JSONDecodeError:
            deltas.append(raw)
            continue
        delta = event.get("choices", [{}])[0].get("delta", {}).get("content")
        if delta:
            deltas.append(str(delta))
    return deltas


def chat_completion_text(response: dict[str, object]) -> str:
    choices = response.get("choices", [])
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0]
    if not isinstance(first, dict):
        return ""
    message = first.get("message", {})
    if not isinstance(message, dict):
        return ""
    return str(message.get("content") or "")


def response_output_items(provider_response: dict[str, object], text: str) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    if text:
        items.append(response_message_item(f"msg_{uuid4().hex[:16]}", text))
    choices = provider_response.get("choices", [])
    if not isinstance(choices, list) or not choices:
        return items or [response_message_item(f"msg_{uuid4().hex[:16]}", "")]
    first = choices[0]
    if not isinstance(first, dict):
        return items or [response_message_item(f"msg_{uuid4().hex[:16]}", "")]
    message = first.get("message", {})
    if not isinstance(message, dict):
        return items or [response_message_item(f"msg_{uuid4().hex[:16]}", "")]
    tool_calls = message.get("tool_calls", [])
    if isinstance(tool_calls, list):
        for call in tool_calls:
            if not isinstance(call, dict):
                continue
            function = call.get("function", {})
            if not isinstance(function, dict):
                function = {}
            call_id = str(call.get("id") or f"call_{uuid4().hex[:16]}")
            items.append(
                {
                    "id": call_id,
                    "type": "function_call",
                    "status": "completed",
                    "call_id": call_id,
                    "name": str(function.get("name") or ""),
                    "arguments": str(function.get("arguments") or "{}"),
                }
            )
    return items or [response_message_item(f"msg_{uuid4().hex[:16]}", "")]


def response_payload(
    response_id: str,
    request: ResponsesCreateRequest,
    text: str,
    usage: object | None,
    *,
    status: str = "completed",
    output: list[dict[str, object]] | None = None,
    error: dict[str, object] | None = None,
) -> dict[str, object]:
    item_id = f"msg_{response_id.removeprefix('resp_')[:16]}"
    return {
        "id": response_id,
        "object": "response",
        "created_at": int(time()),
        "status": status,
        "error": error,
        "model": request.model,
        "instructions": request.instructions,
        "parallel_tool_calls": False,
        "previous_response_id": request.previous_response_id,
        "tool_choice": request.tool_choice or "auto",
        "tools": request.tools,
        "output": output if output is not None else [response_message_item(item_id, text, status=status)],
        "usage": normalize_usage(usage),
        "metadata": request.metadata,
    }


def response_message_item(item_id: str, text: str, *, status: str = "completed") -> dict[str, object]:
    return {
        "id": item_id,
        "type": "message",
        "status": status,
        "role": "assistant",
        "content": [{"type": "output_text", "text": text, "annotations": []}],
    }


def normalize_usage(usage: object | None) -> dict[str, int]:
    if not isinstance(usage, dict):
        return {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    input_tokens = int(usage.get("input_tokens", usage.get("prompt_tokens", 0)))
    output_tokens = int(usage.get("output_tokens", usage.get("completion_tokens", 0)))
    total_tokens = int(usage.get("total_tokens", input_tokens + output_tokens))
    return {"input_tokens": input_tokens, "output_tokens": output_tokens, "total_tokens": total_tokens}


def estimated_usage(request: ChatCompletionRequest, output_text: str) -> dict[str, int]:
    input_tokens = max(1, sum(len(message.content) for message in request.messages) // 4)
    output_tokens = max(1, len(output_text) // 4) if output_text else 0
    return {"prompt_tokens": input_tokens, "completion_tokens": output_tokens, "total_tokens": input_tokens + output_tokens}


def sse(event_type: str, data: dict[str, object]) -> str:
    return f"event: {event_type}\ndata: {json.dumps({'type': event_type, **data})}\n\n"


@router.post("/embeddings")
async def embeddings(authorization: str | None = Header(default=None)):
    key = authenticate_api_key(authorization)
    await ensure_repository_access(key.user_id, force_refresh=True)
    model = MODEL_REGISTRY.get("devquest-embed")
    if not model or model.availability in {"maintenance", "unconfigured"}:
        raise HTTPException(status_code=503, detail={"error": {"message": "Embedding provider is not configured", "type": "model_unavailable"}})
    raise HTTPException(status_code=501, detail={"error": {"message": "Embedding passthrough is not implemented yet", "type": "not_implemented"}})


@router.get("/usage")
async def usage(authorization: str | None = Header(default=None)):
    key = authenticate_api_key(authorization)
    await ensure_repository_access(key.user_id, force_refresh=True)
    return {
        "credits": state.ledger.balance(key.user_id),
        "records": [record for record in state.api_request_logs if record["user_id"] == key.user_id],
    }
