from __future__ import annotations

import json
import os

from .models import ApprovedRepository

REPOSITORY_STAR_REWARD_CREDITS = 200


def load_approved_repositories() -> list[ApprovedRepository]:
    raw = os.getenv("DEVQUEST_APPROVED_REPOS", "").strip()
    if not raw:
      return []

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("DEVQUEST_APPROVED_REPOS must be a JSON array") from exc

    repositories: list[ApprovedRepository] = []
    for item in parsed:
        owner = item["owner"].strip()
        name = item["name"].strip()
        repositories.append(
            ApprovedRepository(
                id=item.get("id") or f"{owner.lower()}/{name.lower()}",
                owner=owner,
                name=name,
                url=item.get("url") or f"https://github.com/{owner}/{name}",
                description=item.get("description", ""),
                avatar_url=item.get("avatar_url"),
                reward_credits=REPOSITORY_STAR_REWARD_CREDITS,
                current_star_count=int(item["current_star_count"]) if item.get("current_star_count") is not None else None,
                star_target=int(item["star_target"]) if item.get("star_target") is not None else None,
                target_bonus_calls=int(item["target_bonus_calls"]) if item.get("target_bonus_calls") is not None else None,
                total_campaign_credits=item.get("total_campaign_credits"),
                campaign_start_date=item.get("campaign_start_date"),
                campaign_end_date=item.get("campaign_end_date"),
                status=item.get("status", "active"),
                sponsor_name=item.get("sponsor_name"),
            )
        )
    return repositories
