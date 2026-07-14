from __future__ import annotations

from collections import defaultdict, deque

from .activity_store import load_api_request_logs, load_notifications, load_platform_logs, load_sponsor_submissions, load_webhook_deliveries
from .admin_store import load_admin_users
from .ledger import CreditLedger
from .ledger_store import load_ledger_records
from .issue_bounty_store import load_issue_bounties, load_issue_bounty_rewards
from .models import AdminUser, ApprovedRepository, GitHubUser, IssueBounty, IssueBountyReward, PullRequestCampaign, PullRequestReward, ReferralClick, ReferralRecord, RepositoryEntitlement, SponsorSubmission, Workflow, WorkflowCredential, WorkflowExecution
from .pull_request_store import load_pull_request_campaigns, load_pull_request_rewards
from .referral_store import load_referral_clicks, load_referrals
from .repository_store import load_repository_campaigns, load_repository_entitlements
from .security import KeyRecord
from .user_store import load_github_users
from .workflow_store import load_workflow_credentials, load_workflow_executions, load_workflows

ledger = CreditLedger(load_ledger_records())
api_keys: dict[str, KeyRecord] = {}
webhook_deliveries: set[str] = load_webhook_deliveries()
github_users, github_tokens = load_github_users()
repositories: dict[str, ApprovedRepository] = {repo.id: repo for repo in load_repository_campaigns()}
pull_request_campaigns: dict[str, PullRequestCampaign] = {campaign.id: campaign for campaign in load_pull_request_campaigns()}
pull_request_rewards: dict[str, PullRequestReward] = {reward.id: reward for reward in load_pull_request_rewards()}
issue_bounties: dict[str, IssueBounty] = {bounty.id: bounty for bounty in load_issue_bounties()}
issue_bounty_rewards: dict[str, IssueBountyReward] = {reward.id: reward for reward in load_issue_bounty_rewards()}
entitlements: dict[str, RepositoryEntitlement] = {f"{item.user_id}:{item.repository_id}": item for item in load_repository_entitlements()}
notifications: dict[str, list[dict[str, object]]] = defaultdict(list, load_notifications())
api_request_logs: list[dict[str, object]] = load_api_request_logs()
platform_logs: deque[dict[str, object]] = deque(load_platform_logs(), maxlen=500)
sponsor_submissions: dict[str, SponsorSubmission] = load_sponsor_submissions()
referrals: dict[str, ReferralRecord] = {f"{item.referrer_user_id}:{item.referred_user_id}": item for item in load_referrals()}
referral_clicks: dict[str, ReferralClick] = {item.click_id: item for item in load_referral_clicks()}
admin_users: dict[str, AdminUser] = {admin.username: admin for admin in load_admin_users()}
workflows: dict[str, Workflow] = {workflow.id: workflow for workflow in load_workflows()}
workflow_executions: list[WorkflowExecution] = load_workflow_executions()
workflow_credentials: dict[str, WorkflowCredential] = {credential.id: credential for credential in load_workflow_credentials()}
rate_minute: dict[str, deque[float]] = defaultdict(deque)
rate_day: dict[str, deque[float]] = defaultdict(deque)
active_requests: dict[str, int] = defaultdict(int)


def reset_in_memory_state() -> None:
    ledger.records.clear()
    ledger.idempotency_keys.clear()
    api_keys.clear()
    webhook_deliveries.clear()
    github_users.clear()
    github_tokens.clear()
    repositories.clear()
    pull_request_campaigns.clear()
    pull_request_rewards.clear()
    issue_bounties.clear()
    issue_bounty_rewards.clear()
    entitlements.clear()
    notifications.clear()
    api_request_logs.clear()
    platform_logs.clear()
    sponsor_submissions.clear()
    referrals.clear()
    referral_clicks.clear()
    admin_users.clear()
    workflows.clear()
    workflow_executions.clear()
    workflow_credentials.clear()
    rate_minute.clear()
    rate_day.clear()
    active_requests.clear()
