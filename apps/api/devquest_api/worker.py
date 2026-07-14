from __future__ import annotations

import asyncio

from . import state
from .config import STAR_RECHECK_SECONDS
from .services.entitlements import verify_repository_star


async def verification_loop() -> None:
    while True:
        for entitlement in list(state.entitlements.values()):
            user = state.github_users.get(entitlement.user_id)
            repo = state.repositories.get(entitlement.repository_id)
            if user and repo:
                await verify_repository_star(user, repo)
        await asyncio.sleep(STAR_RECHECK_SECONDS)


if __name__ == "__main__":
    asyncio.run(verification_loop())
