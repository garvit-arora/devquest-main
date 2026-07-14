from __future__ import annotations

from .models import ReferralClick, ReferralRecord
from .repository_store import document_without_mongo_id, mongo_database


def load_referrals() -> list[ReferralRecord]:
    collection = referral_collection()
    if collection is None:
        return []
    return [ReferralRecord(**document_without_mongo_id(document)) for document in collection.find({})]


def save_referral(record: ReferralRecord) -> None:
    collection = referral_collection()
    if collection is None:
        return
    collection.replace_one(
        {"referrer_user_id": record.referrer_user_id, "referred_user_id": record.referred_user_id},
        record.model_dump(mode="json"),
        upsert=True,
    )


def load_referral_clicks() -> list[ReferralClick]:
    collection = referral_click_collection()
    if collection is None:
        return []
    return [ReferralClick(**document_without_mongo_id(document)) for document in collection.find({})]


def save_referral_click(click: ReferralClick) -> None:
    collection = referral_click_collection()
    if collection is None:
        return
    collection.replace_one({"click_id": click.click_id}, click.model_dump(mode="json"), upsert=True)


def referral_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["referrals"]
    collection.create_index([("referrer_user_id", 1), ("referred_user_id", 1)], unique=True)
    collection.create_index("created_at")
    return collection


def referral_click_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["referral_clicks"]
    collection.create_index("click_id", unique=True)
    collection.create_index("referrer_user_id")
    collection.create_index("created_at")
    collection.create_index("converted")
    return collection
