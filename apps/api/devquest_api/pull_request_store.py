from __future__ import annotations

import json
import os
from typing import Any

from .models import PullRequestCampaign, PullRequestReward
from .repository_store import document_without_mongo_id, mongo_database


def load_pull_request_campaigns() -> list[PullRequestCampaign]:
    configured = load_configured_pull_request_campaigns()
    collection = pull_request_campaign_collection()
    if collection is None:
        return configured

    for campaign in configured:
        collection.replace_one({"id": campaign.id}, campaign.model_dump(mode="json"), upsert=True)

    return [PullRequestCampaign(**document_without_mongo_id(document)) for document in collection.find({})]


def load_configured_pull_request_campaigns() -> list[PullRequestCampaign]:
    raw = os.getenv("DEVQUEST_PR_REPOS", "").strip()
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("DEVQUEST_PR_REPOS must be a JSON array") from exc

    campaigns: list[PullRequestCampaign] = []
    for item in parsed:
        owner = item["owner"].strip()
        name = item["name"].strip()
        campaigns.append(
            PullRequestCampaign(
                id=item.get("id") or f"{owner.lower()}/{name.lower()}",
                owner=owner,
                name=name,
                url=item.get("url") or f"https://github.com/{owner}/{name}",
                description=item.get("description", ""),
                reward_credits=int(item.get("reward_credits", 150)),
                status=item.get("status", "active"),
                sponsor_name=item.get("sponsor_name"),
            )
        )
    return campaigns


def save_pull_request_campaign(campaign: PullRequestCampaign) -> None:
    collection = pull_request_campaign_collection()
    if collection is None:
        return
    collection.replace_one({"id": campaign.id}, campaign.model_dump(mode="json"), upsert=True)


def save_pull_request_reward(reward: PullRequestReward) -> None:
    collection = pull_request_reward_collection()
    if collection is None:
        return
    collection.replace_one({"id": reward.id}, reward.model_dump(mode="json"), upsert=True)


def load_pull_request_rewards() -> list[PullRequestReward]:
    collection = pull_request_reward_collection()
    if collection is None:
        return []
    return [PullRequestReward(**document_without_mongo_id(document)) for document in collection.find({})]


def pull_request_campaign_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["pull_request_campaigns"]
    collection.create_index("id", unique=True)
    collection.create_index("status")
    return collection


def pull_request_reward_collection():
    database = mongo_database()
    if database is None:
        return None
    collection = database["pull_request_rewards"]
    collection.create_index([("user_id", 1), ("campaign_id", 1), ("pull_request_number", 1)], unique=True)
    collection.create_index("status")
    collection.create_index("created_at")
    return collection
