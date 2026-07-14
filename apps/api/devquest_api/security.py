from __future__ import annotations

import hashlib
import hmac
import base64
import json
import os
import secrets
from dataclasses import dataclass
from dataclasses import field
from datetime import datetime
from time import time


def generate_api_key() -> str:
    return f"dq_live_{secrets.token_urlsafe(28).replace('-', '').replace('_', '')[:32]}"


def hash_api_key(raw_key: str) -> str:
    pepper = os.getenv("DEVQUEST_API_KEY_PEPPER", "devquest-dev-pepper")
    return hashlib.sha256(f"{pepper}:{raw_key}".encode("utf-8")).hexdigest()


def verify_api_key(raw_key: str, expected_hash: str) -> bool:
    return hmac.compare_digest(hash_api_key(raw_key), expected_hash)


def verify_github_signature(payload: bytes, signature_header: str | None) -> bool:
    if not signature_header:
        return False
    secret = os.getenv("GITHUB_WEBHOOK_SECRET", "devquest_dev_webhook_secret").encode("utf-8")
    digest = hmac.new(secret, payload, hashlib.sha256).hexdigest()
    expected = f"sha256={digest}"
    return hmac.compare_digest(expected, signature_header)


def session_secret() -> bytes:
    return os.getenv("SESSION_SECRET", "replace-with-32-random-bytes").encode("utf-8")


def sign_session(payload: dict[str, object], max_age_seconds: int = 60 * 60 * 24 * 7) -> str:
    body = {**payload, "exp": int(time()) + max_age_seconds}
    encoded = base64.urlsafe_b64encode(json.dumps(body, separators=(",", ":")).encode("utf-8")).decode("ascii")
    signature = hmac.new(session_secret(), encoded.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def verify_session(cookie: str | None) -> dict[str, object] | None:
    if not cookie or "." not in cookie:
        return None
    encoded, signature = cookie.rsplit(".", 1)
    expected = hmac.new(session_secret(), encoded.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(encoded.encode("ascii")).decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return None
    if int(payload.get("exp", 0)) < int(time()):
        return None
    return payload


@dataclass
class KeyRecord:
    id: str
    user_id: str
    name: str
    prefix: str
    key_hash: str
    environment: str
    models: list[str]
    spending_limit: int
    status: str = "active"
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    last_used_at: str | None = None
