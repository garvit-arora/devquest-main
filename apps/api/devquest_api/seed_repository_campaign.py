from __future__ import annotations

import argparse

from . import config  # noqa: F401 - loads root .env before MongoDB access.
from .models import ApprovedRepository
from .repository_store import repository_collection, save_repository_campaign


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed or update one DevQuest repository campaign in MongoDB.")
    parser.add_argument("--owner", required=True, help="GitHub owner or organization.")
    parser.add_argument("--name", required=True, help="GitHub repository name.")
    parser.add_argument("--url", help="Repository URL. Defaults to https://github.com/<owner>/<name>.")
    parser.add_argument("--description", default="", help="Campaign description.")
    parser.add_argument("--reward-credits", type=int, default=200, help="Credits awarded for a verified star.")
    parser.add_argument("--current-star-count", type=int, default=None, help="Current public star count.")
    parser.add_argument("--star-target", type=int, default=None, help="Target stars for the campaign.")
    parser.add_argument("--target-bonus-calls", type=int, default=None, help="Extra calls awarded when target is reached.")
    parser.add_argument("--status", default="active", choices=["active", "paused", "completed", "pending_review"], help="Campaign status.")
    parser.add_argument("--sponsor-name", default=None, help="Sponsor display name.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if repository_collection() is None:
        raise SystemExit("MongoDB is not configured. Set MONGODB_URI and MONGODB_DATABASE before seeding campaigns.")
    owner = args.owner.strip()
    name = args.name.strip()
    repo = ApprovedRepository(
        id=f"{owner.lower()}/{name.lower()}",
        owner=owner,
        name=name,
        url=args.url or f"https://github.com/{owner}/{name}",
        description=args.description,
        reward_credits=args.reward_credits,
        current_star_count=args.current_star_count,
        star_target=args.star_target,
        target_bonus_calls=args.target_bonus_calls,
        status=args.status,
        sponsor_name=args.sponsor_name,
    )
    save_repository_campaign(repo)
    print(f"Seeded repository campaign: {repo.id} -> {repo.url}")


if __name__ == "__main__":
    main()
