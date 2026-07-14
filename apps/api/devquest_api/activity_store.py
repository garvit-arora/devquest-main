from __future__ import annotations

from typing import Any

from .models import SponsorSubmission
from .repository_store import document_without_mongo_id, mongo_database


def save_notification(user_id: str, notification: dict[str, object]) -> None:
    collection = notification_collection()
    if collection is None:
        return
    document = {"_id": notification["id"], "user_id": user_id, **notification}
    collection.replace_one({"id": notification["id"]}, document, upsert=True)


def load_notifications() -> dict[str, list[dict[str, object]]]:
    collection = notification_collection()
    if collection is None:
        return {}
    grouped: dict[str, list[dict[str, object]]] = {}
    for document in collection.find({}).sort("created_at", -1):
        clean = document_without_mongo_id(document)
        user_id = str(clean.pop("user_id"))
        grouped.setdefault(user_id, []).append(clean)
    return grouped


def save_api_request_log(log: dict[str, object]) -> None:
    collection = api_request_log_collection()
    if collection is None:
        return
    document = {"_id": log.get("request_id"), **log}
    collection.replace_one({"request_id": log.get("request_id")}, document, upsert=True)


def load_api_request_logs() -> list[dict[str, object]]:
    collection = api_request_log_collection()
    if collection is None:
        return []
    return [document_without_mongo_id(document) for document in collection.find({}).sort("timestamp", 1)]


def save_platform_log(log: dict[str, object]) -> None:
    collection = platform_log_collection()
    if collection is None:
        return
    document = {"_id": log["id"], **log}
    collection.replace_one({"id": log["id"]}, document, upsert=True)


def load_platform_logs(limit: int = 500) -> list[dict[str, object]]:
    collection = platform_log_collection()
    if collection is None:
        return []
    return [document_without_mongo_id(document) for document in collection.find({}).sort("timestamp", -1).limit(limit)]


def save_sponsor_submission(submission: SponsorSubmission) -> None:
    collection = sponsor_submission_collection()
    if collection is None:
        return
    collection.replace_one({"id": submission.id}, submission.model_dump(mode="json") | {"_id": submission.id}, upsert=True)


def load_sponsor_submissions() -> dict[str, SponsorSubmission]:
    collection = sponsor_submission_collection()
    if collection is None:
        return {}
    submissions: dict[str, SponsorSubmission] = {}
    for document in collection.find({}).sort("created_at", -1):
        clean = document_without_mongo_id(document)
        submission = SponsorSubmission(**clean)
        submissions[submission.id] = submission
    return submissions


def save_webhook_delivery(delivery_id: str, payload: dict[str, Any] | None = None) -> None:
    collection = webhook_delivery_collection()
    if collection is None:
        return
    collection.replace_one({"delivery_id": delivery_id}, {"_id": delivery_id, "delivery_id": delivery_id, "payload": payload or {}}, upsert=True)


def load_webhook_deliveries() -> set[str]:
    collection = webhook_delivery_collection()
    if collection is None:
        return set()
    return {str(document["delivery_id"]) for document in collection.find({}, {"delivery_id": 1})}


def notification_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["notifications"]
    collection.create_index("id", unique=True)
    collection.create_index("user_id")
    collection.create_index("created_at")
    return collection


def api_request_log_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["api_request_logs"]
    collection.create_index("request_id", unique=True)
    collection.create_index("user_id")
    collection.create_index("key_prefix")
    collection.create_index("timestamp")
    return collection


def platform_log_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["platform_logs"]
    collection.create_index("id", unique=True)
    collection.create_index("level")
    collection.create_index("timestamp")
    return collection


def sponsor_submission_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["sponsor_submissions"]
    collection.create_index("id", unique=True)
    collection.create_index([("payload.repository_url", 1), ("payload.work_email", 1)], unique=True)
    collection.create_index("status")
    collection.create_index("created_at")
    return collection


def webhook_delivery_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["webhook_deliveries"]
    collection.create_index("delivery_id", unique=True)
    return collection
