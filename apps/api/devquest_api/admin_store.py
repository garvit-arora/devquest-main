from __future__ import annotations

import hashlib
import hmac
import json
import os
from typing import Any

from .config import settings
from .models import AdminUser
from .repository_store import document_without_mongo_id, mongo_database


def hash_admin_password(password: str) -> str:
    return hashlib.sha256(f"{settings.admin_password_pepper}:{password}".encode("utf-8")).hexdigest()


def verify_admin_password(password: str, expected_hash: str) -> bool:
    return hmac.compare_digest(hash_admin_password(password), expected_hash)


def load_admin_users() -> list[AdminUser]:
    configured = configured_admin_users()
    collection = admin_collection()
    if collection is None:
        return configured or local_dev_admin()

    for admin in configured:
        collection.replace_one({"username": admin.username}, admin.model_dump(mode="json"), upsert=True)
    saved = [AdminUser(**document_without_mongo_id(document)) for document in collection.find({})]
    return saved or local_dev_admin()


def configured_admin_users() -> list[AdminUser]:
    raw = os.getenv("DEVQUEST_ADMIN_USERS", "").strip()
    if not raw:
        username = os.getenv("DEVQUEST_ADMIN_USERNAME", "").strip()
        password_hash = os.getenv("DEVQUEST_ADMIN_PASSWORD_HASH", "").strip()
        if username and password_hash:
            return [AdminUser(username=username, password_hash=password_hash, role=os.getenv("DEVQUEST_ADMIN_ROLE", "admin"))]
        return []
    try:
        payload: Any = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(payload, list):
        return []
    admins: list[AdminUser] = []
    for item in payload:
        if isinstance(item, dict) and item.get("username") and item.get("password_hash"):
            admins.append(AdminUser(**item))
    return admins


def local_dev_admin() -> list[AdminUser]:
    if settings.app_url.startswith("http://localhost") or settings.app_url.startswith("http://127.0.0.1"):
        return [AdminUser(username="admin", password_hash=hash_admin_password("devquest-admin"), role="owner", display_name="Local Admin")]
    return []


def admin_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["admin_users"]
    collection.create_index("username", unique=True)
    collection.create_index("role")
    return collection
