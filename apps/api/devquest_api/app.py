from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import state
from .activity_store import load_api_request_logs, load_notifications, load_platform_logs, load_sponsor_submissions, load_webhook_deliveries
from .config import settings
from .admin_store import load_admin_users
from .issue_bounty_store import load_issue_bounties, load_issue_bounty_rewards
from .key_store import load_api_keys
from .ledger_store import load_ledger_records
from .pull_request_store import load_pull_request_campaigns, load_pull_request_rewards
from .referral_store import load_referral_clicks, load_referrals
from .repository_store import load_repository_campaigns, load_repository_entitlements
from .routers import admin, ai_tools, api_keys, auth, bounties, gateway, health, issue_bounties, marketplace, product, profiles, projects, pull_requests, referrals, rewards, sponsors, streaks, webhooks, workflows
from .user_store import load_github_users
from .workflow_store import load_workflow_credentials, load_workflow_executions, load_workflows


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        users, tokens = load_github_users()
        state.github_users.update(users)
        state.github_tokens.update(tokens)
        state.repositories.update({repo.id: repo for repo in load_repository_campaigns()})
        state.pull_request_campaigns.update({campaign.id: campaign for campaign in load_pull_request_campaigns()})
        state.pull_request_rewards.update({reward.id: reward for reward in load_pull_request_rewards()})
        state.issue_bounties.update({bounty.id: bounty for bounty in load_issue_bounties()})
        state.issue_bounty_rewards.update({reward.id: reward for reward in load_issue_bounty_rewards()})
        state.entitlements.update({f"{item.user_id}:{item.repository_id}": item for item in load_repository_entitlements()})
        state.referrals.clear()
        state.referrals.update({f"{item.referrer_user_id}:{item.referred_user_id}": item for item in load_referrals()})
        state.referral_clicks.clear()
        state.referral_clicks.update({item.click_id: item for item in load_referral_clicks()})
        state.admin_users.update({item.username: item for item in load_admin_users()})
        state.notifications.clear()
        state.notifications.update(load_notifications())
        state.api_request_logs[:] = load_api_request_logs()
        state.platform_logs.clear()
        state.platform_logs.extend(load_platform_logs())
        state.sponsor_submissions.clear()
        state.sponsor_submissions.update(load_sponsor_submissions())
        state.workflows.clear()
        state.workflows.update({item.id: item for item in load_workflows()})
        state.workflow_executions[:] = load_workflow_executions()
        state.workflow_credentials.clear()
        state.workflow_credentials.update({item.id: item for item in load_workflow_credentials()})
        state.webhook_deliveries.clear()
        state.webhook_deliveries.update(load_webhook_deliveries())
        state.ledger.load_records(load_ledger_records())
        for record in load_api_keys():
            state.api_keys[record.prefix] = record
        yield

    app = FastAPI(title="DevQuest AI API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.app_url, "http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(product.router)
    app.include_router(bounties.router)
    app.include_router(issue_bounties.router)
    app.include_router(marketplace.router)
    app.include_router(streaks.router)
    app.include_router(profiles.router)
    app.include_router(rewards.router)
    app.include_router(ai_tools.router)
    app.include_router(projects.router)
    app.include_router(pull_requests.router)
    app.include_router(referrals.router)
    app.include_router(api_keys.router)
    app.include_router(admin.router)
    app.include_router(sponsors.router)
    app.include_router(webhooks.router)
    app.include_router(workflows.router)
    app.include_router(gateway.router)
    return app
