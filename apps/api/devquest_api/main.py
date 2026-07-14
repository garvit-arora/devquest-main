from __future__ import annotations

from .app import create_app
from .config import OAUTH_STATE_COOKIE, SESSION_COOKIE
from .deps import now_utc
from .providers import MODEL_REGISTRY, provider
from .services.entitlements import check_github_star, ensure_repository_access, entitlement_key, verify_repository_star
from .state import (
    active_requests,
    api_keys,
    api_request_logs,
    admin_users,
    entitlements,
    github_tokens,
    github_users,
    issue_bounties,
    issue_bounty_rewards,
    ledger,
    notifications,
    platform_logs,
    pull_request_campaigns,
    pull_request_rewards,
    rate_day,
    rate_minute,
    referral_clicks,
    repositories,
    reset_in_memory_state,
    referrals,
    sponsor_submissions,
    workflow_credentials,
    workflow_executions,
    workflows,
    webhook_deliveries,
)

app = create_app()

__all__ = [
    "app",
    "SESSION_COOKIE",
    "OAUTH_STATE_COOKIE",
    "MODEL_REGISTRY",
    "active_requests",
    "api_keys",
    "api_request_logs",
    "admin_users",
    "check_github_star",
    "ensure_repository_access",
    "entitlement_key",
    "entitlements",
    "github_tokens",
    "github_users",
    "issue_bounties",
    "issue_bounty_rewards",
    "ledger",
    "notifications",
    "now_utc",
    "platform_logs",
    "pull_request_campaigns",
    "pull_request_rewards",
    "provider",
    "rate_day",
    "rate_minute",
    "referral_clicks",
    "repositories",
    "reset_in_memory_state",
    "referrals",
    "sponsor_submissions",
    "workflow_credentials",
    "workflow_executions",
    "workflows",
    "verify_repository_star",
    "webhook_deliveries",
]
