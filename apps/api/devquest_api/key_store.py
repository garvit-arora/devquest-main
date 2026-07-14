from __future__ import annotations

import os
from typing import Any

from .security import KeyRecord


def database_enabled() -> bool:
    uri = os.getenv("MONGODB_URI", "").strip()
    return bool(uri and "<" not in uri and ">" not in uri)


def api_key_document(record: KeyRecord) -> dict[str, Any]:
    return {
        "_id": record.id,
        "id": record.id,
        "user_id": record.user_id,
        "name": record.name,
        "prefix": record.prefix,
        "key_hash": record.key_hash,
        "environment": record.environment,
        "models": record.models,
        "spending_limit": record.spending_limit,
        "status": record.status,
        "created_at": record.created_at,
        "last_used_at": record.last_used_at,
    }


def record_from_document(document: dict[str, Any]) -> KeyRecord:
    return KeyRecord(
        id=str(document["id"]),
        user_id=str(document["user_id"]),
        name=str(document["name"]),
        prefix=str(document["prefix"]),
        key_hash=str(document["key_hash"]),
        environment=str(document["environment"]),
        models=[str(model) for model in document.get("models", [])],
        spending_limit=int(document.get("spending_limit", 0)),
        status=str(document.get("status", "active")),
        created_at=str(document.get("created_at", "")),
        last_used_at=document.get("last_used_at"),
    )


def save_api_key(record: KeyRecord) -> None:
    collection = api_key_collection()
    if collection is None:
        return
    collection.replace_one({"prefix": record.prefix}, api_key_document(record), upsert=True)


def load_api_keys() -> list[KeyRecord]:
    collection = api_key_collection()
    if collection is None:
        return []
    return [record_from_document(document) for document in collection.find({})]


def api_key_collection():
    if not database_enabled():
        return None
    try:
        from pymongo import MongoClient
    except ImportError:
        return None

    client = MongoClient(os.environ["MONGODB_URI"], serverSelectionTimeoutMS=2500)
    database = client[os.getenv("MONGODB_DATABASE", "devquest")]
    collection = database["api_keys"]
    collection.create_index("prefix", unique=True)
    collection.create_index("user_id")
    return collection
