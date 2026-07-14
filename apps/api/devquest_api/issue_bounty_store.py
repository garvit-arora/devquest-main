from __future__ import annotations

import json
import os
from typing import Any

from .models import IssueBounty, IssueBountyCreate, IssueBountyReward
from .repository_store import document_without_mongo_id, mongo_database


def load_issue_bounties() -> list[IssueBounty]:
    configured = load_configured_issue_bounties()
    collection = issue_bounty_collection()
    if collection is None:
        return configured

    for bounty in configured:
        collection.replace_one({"id": bounty.id}, bounty.model_dump(mode="json"), upsert=True)

    return [IssueBounty(**document_without_mongo_id(document)) for document in collection.find({})]


def load_configured_issue_bounties() -> list[IssueBounty]:
    raw = os.getenv("DEVQUEST_ISSUE_BOUNTIES", "").strip()
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("DEVQUEST_ISSUE_BOUNTIES must be a JSON array") from exc
    if not isinstance(parsed, list):
        raise RuntimeError("DEVQUEST_ISSUE_BOUNTIES must be a JSON array")

    bounties: list[IssueBounty] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        create = IssueBountyCreate(**item)
        bounties.append(issue_bounty_from_create(create, bounty_id=item.get("id")))
    return bounties


def issue_bounty_from_create(input: IssueBountyCreate, bounty_id: str | None = None) -> IssueBounty:
    owner = input.owner.strip()
    name = input.name.strip()
    normalized_id = bounty_id or f"{owner.lower()}/{name.lower()}#{input.issue_number}"
    return IssueBounty(
        id=normalized_id,
        owner=owner,
        name=name,
        issue_number=input.issue_number,
        issue_url=f"https://github.com/{owner}/{name}/issues/{input.issue_number}",
        title=input.title,
        description=input.description,
        reward_credits=input.reward_credits,
        kind=input.kind,
        status=input.status,
        sponsor_name=input.sponsor_name,
        deadline=input.deadline,
    )


def save_issue_bounty(bounty: IssueBounty) -> None:
    collection = issue_bounty_collection()
    if collection is None:
        return
    collection.replace_one({"id": bounty.id}, bounty.model_dump(mode="json"), upsert=True)


def load_issue_bounty_rewards() -> list[IssueBountyReward]:
    collection = issue_bounty_reward_collection()
    if collection is None:
        return []
    return [IssueBountyReward(**document_without_mongo_id(document)) for document in collection.find({})]


def save_issue_bounty_reward(reward: IssueBountyReward) -> None:
    collection = issue_bounty_reward_collection()
    if collection is None:
        return
    collection.replace_one({"id": reward.id}, reward.model_dump(mode="json"), upsert=True)


def issue_bounty_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["issue_bounties"]
    collection.create_index("id", unique=True)
    collection.create_index([("owner", 1), ("name", 1), ("issue_number", 1)], unique=True)
    collection.create_index("status")
    collection.create_index("sponsor_name")
    return collection


def issue_bounty_reward_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["issue_bounty_rewards"]
    collection.create_index("id", unique=True)
    collection.create_index([("user_id", 1), ("bounty_id", 1), ("pull_request_number", 1)], unique=True)
    collection.create_index("status")
    collection.create_index("created_at")
    return collection
