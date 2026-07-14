from __future__ import annotations

from .models import LedgerRecord
from .repository_store import document_without_mongo_id, mongo_database


def load_ledger_records() -> list[LedgerRecord]:
    collection = ledger_collection()
    if collection is None:
        return []
    documents = collection.find({}).sort("created_at", 1)
    return [LedgerRecord(**document_without_mongo_id(document)) for document in documents]


def save_ledger_record(record: LedgerRecord) -> None:
    collection = ledger_collection()
    if collection is None:
        return
    collection.replace_one({"id": record.id}, record.model_dump(mode="json"), upsert=True)


def ledger_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["ledger_records"]
    collection.create_index("id", unique=True)
    collection.create_index("user_id")
    collection.create_index("idempotency_key", unique=True)
    collection.create_index("type")
    collection.create_index("created_at")
    return collection
