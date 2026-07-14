from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import AsyncIterable

import httpx

from .config import settings
from .models import ChatCompletionRequest, ModelAlias


@dataclass(frozen=True)
class ModelSpec:
    id: str
    env_name: str
    multiplier: float
    label: str


MODEL_SPECS = [
    ModelSpec("DeepSeek-V4-Pro", "DEVQUEST_DEEPSEEK_V4_PRO_MODEL", 2.0, "DeepSeek V4 Pro"),
    ModelSpec("gpt-5.5", "DEVQUEST_AZURE_GPT_55_MODEL", 2.0, "GPT 5.5"),
    ModelSpec("gpt-5.6-luna", "DEVQUEST_AZURE_GPT_56_LUNA_MODEL", 2.0, "GPT 5.6 Luna"),
    ModelSpec("gpt-5.6-sol", "DEVQUEST_AZURE_GPT_56_SOL_MODEL", 2.0, "GPT 5.6 Sol"),
    ModelSpec("devquest-gpt-56-sol", "DEVQUEST_GPT_56_SOL_MODEL", 2.0, "GPT 5.6 Sol"),
    ModelSpec("devquest-gpt-55", "DEVQUEST_GPT_55_MODEL", 2.0, "GPT 5.5"),
    ModelSpec("devquest-luna", "DEVQUEST_LUNA_MODEL", 2.0, "Luna"),
    ModelSpec("devquest-deepseek-55", "DEVQUEST_DEEPSEEK_55_MODEL", 2.0, "DeepSeek 5.5"),
    ModelSpec("devquest-deepseek-research", "DEVQUEST_DEEPSEEK_RESEARCH_MODEL", 2.0, "DeepSeek Research"),
    ModelSpec("devquest-fast", "DEVQUEST_FAST_MODEL", 1.0, "Fast"),
    ModelSpec("devquest-reason", "DEVQUEST_REASON_MODEL", 2.0, "Reason"),
    ModelSpec("devquest-code", "DEVQUEST_CODE_MODEL", 2.0, "Code"),
    ModelSpec("devquest-deepseek", "DEVQUEST_DEEPSEEK_MODEL", 2.0, "DeepSeek"),
    ModelSpec("devquest-research", "DEVQUEST_RESEARCH_MODEL", 2.0, "Research"),
    ModelSpec("devquest-mini", "DEVQUEST_MINI_MODEL", 1.0, "Mini"),
    ModelSpec("devquest-embed", "DEVQUEST_EMBED_MODEL", 1.0, "Embeddings"),
]


def alias(id: str, env_name: str, multiplier: float, availability: str = "available") -> ModelAlias:
    upstream = os.getenv(env_name)
    return ModelAlias(
        id=id,
        availability=availability if upstream else "unconfigured",
        credit_multiplier=min(float(settings.max_credits_per_request), multiplier),
        upstream_model=upstream,
    )


MODEL_REGISTRY = {spec.id: alias(spec.id, spec.env_name, spec.multiplier) for spec in MODEL_SPECS}


def configured_model_ids() -> list[str]:
    return [model.id for model in MODEL_REGISTRY.values() if model.availability == "available" and model.upstream_model]


def public_model_ids() -> list[str]:
    requested = [item.strip() for item in os.getenv("DEVQUEST_PUBLIC_MODELS", "").split(",") if item.strip()]
    if not requested:
        requested = configured_model_ids() or ["DeepSeek-V4-Pro", "gpt-5.5", "gpt-5.6-luna", "gpt-5.6-sol"]
    allowed = [model_id for model_id in requested if model_id in MODEL_REGISTRY]
    return allowed


def public_models() -> list[ModelAlias]:
    return [MODEL_REGISTRY[model_id] for model_id in public_model_ids()]


def request_credit_cost(model: ModelAlias) -> int:
    return max(1, settings.max_credits_per_request)


class ProviderUnavailable(Exception):
    pass


class OpenAICompatibleProvider:
    def __init__(self) -> None:
        self.base_url = self.normalize_base_url(os.getenv("DEVQUEST_PROVIDER_BASE_URL", ""))
        self.api_key = os.getenv("DEVQUEST_PROVIDER_API_KEY", "")
        self.api_version = os.getenv("DEVQUEST_PROVIDER_API_VERSION", "").strip()

    @staticmethod
    def normalize_base_url(value: str) -> str:
        clean = value.strip().rstrip("/")
        if clean.endswith(".openai.azure.com"):
            return f"{clean}/openai/v1"
        return clean

    def configured(self) -> bool:
        return bool(self.base_url and self.api_key)

    def upstream_request(self, request: ChatCompletionRequest) -> dict[str, object]:
        model = MODEL_REGISTRY.get(request.model)
        if not model or not model.upstream_model:
            raise ProviderUnavailable("Model alias is not mapped to an upstream model")
        payload = request.model_dump()
        payload["model"] = model.upstream_model
        return payload

    async def chat_completion(self, request: ChatCompletionRequest) -> dict[str, object]:
        if not self.configured():
            raise ProviderUnavailable("Model provider is not configured")
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}", "api-key": self.api_key, "Content-Type": "application/json"},
                    params={"api-version": self.api_version} if self.api_version else None,
                    json=self.upstream_request(request),
                )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderUnavailable(f"Azure provider request failed: {exc}") from exc
        data = response.json()
        if isinstance(data, dict):
            data["model"] = request.model
        return data

    async def stream_chat_completion(self, request: ChatCompletionRequest) -> AsyncIterable[str]:
        if not self.configured():
            raise ProviderUnavailable("Model provider is not configured")
        payload = self.upstream_request(request)
        payload["stream"] = True
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}", "api-key": self.api_key, "Content-Type": "application/json"},
                    params={"api-version": self.api_version} if self.api_version else None,
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        if line.startswith("data: "):
                            raw = line.removeprefix("data: ")
                            if raw == "[DONE]":
                                yield "data: [DONE]\n\n"
                                continue
                            try:
                                event = json.loads(raw)
                                event["model"] = request.model
                                yield f"data: {json.dumps(event)}\n\n"
                            except json.JSONDecodeError:
                                yield f"{line}\n\n"
                        else:
                            yield f"{line}\n\n"
        except httpx.HTTPError as exc:
            raise ProviderUnavailable(f"Azure provider stream failed: {exc}") from exc


provider = OpenAICompatibleProvider()
