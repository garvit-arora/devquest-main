from __future__ import annotations

import os
from typing import Any

from .models import ApprovedRepository, RepositoryEntitlement
from .repositories import load_approved_repositories


def database_enabled() -> bool:
    uri = os.getenv("MONGODB_URI", "").strip()
    return bool(uri and "<" not in uri and ">" not in uri)


def load_repository_campaigns() -> list[ApprovedRepository]:
    configured = load_approved_repositories()
    collection = repository_collection()
    if collection is None:
        return configured

    for repo in configured:
        collection.replace_one({"id": repo.id}, repo.model_dump(mode="json"), upsert=True)

    campaigns = []
    for document in collection.find({}):
        campaign = ApprovedRepository(**document_without_mongo_id(document))
        campaigns.append(campaign)
    return campaigns


def save_repository_campaign(repo: ApprovedRepository) -> None:
    collection = repository_collection()
    if collection is None:
        return
    collection.replace_one({"id": repo.id}, repo.model_dump(mode="json"), upsert=True)


def load_repository_entitlements() -> list[RepositoryEntitlement]:
    collection = entitlement_collection()
    if collection is None:
        return []
    return [RepositoryEntitlement(**document_without_mongo_id(document)) for document in collection.find({})]


def save_repository_entitlement(entitlement: RepositoryEntitlement) -> None:
    collection = entitlement_collection()
    if collection is None:
        return
    collection.replace_one(
        {"user_id": entitlement.user_id, "repository_id": entitlement.repository_id},
        entitlement.model_dump(mode="json"),
        upsert=True,
    )


def repository_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["repository_campaigns"]
    collection.create_index("id", unique=True)
    collection.create_index("status")
    return collection


def entitlement_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["repository_entitlements"]
    collection.create_index([("user_id", 1), ("repository_id", 1)], unique=True)
    collection.create_index("status")
    return collection


def mongo_database():
    if not database_enabled():
        return None
    try:
        from pymongo import MongoClient
    except ImportError:
        return None
    client = MongoClient(os.environ["MONGODB_URI"], serverSelectionTimeoutMS=2500)
    return client[os.getenv("MONGODB_DATABASE", "devquest")]


def document_without_mongo_id(document: dict[str, Any]) -> dict[str, Any]:
    clean = dict(document)
    clean.pop("_id", None)
    return clean
