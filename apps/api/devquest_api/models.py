from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class LedgerType(StrEnum):
    signup_bonus = "signup_bonus"
    quest_reward_pending = "quest_reward_pending"
    quest_reward_settled = "quest_reward_settled"
    quest_reward_reversed = "quest_reward_reversed"
    model_usage = "model_usage"
    repository_star_reward = "repository_star_reward"
    pull_request_reward = "pull_request_reward"
    repository_reward_pending = "repository_reward_pending"
    repository_reward_settled = "repository_reward_settled"
    api_usage_reserved = "api_usage_reserved"
    api_usage_settled = "api_usage_settled"
    api_usage_released = "api_usage_released"
    manual_adjustment = "manual_adjustment"
    reward_reversal = "reward_reversal"
    offer_reward = "offer_reward"
    promotional_credit = "promotional_credit"
    referral_bonus = "referral_bonus"
    sponsor_reward = "sponsor_reward"
    issue_bounty_reward = "issue_bounty_reward"
    streak_bonus = "streak_bonus"
    referral_tier_bonus = "referral_tier_bonus"
    marketplace_purchase = "marketplace_purchase"
    credit_boost_bonus = "credit_boost_bonus"
    achievement_reward = "achievement_reward"
    refund = "refund"
    expiration = "expiration"
    fraud_reversal = "fraud_reversal"


class LedgerRecord(BaseModel):
    id: str
    user_id: str
    type: LedgerType
    amount: int
    currency_unit: str = "credits"
    status: str = "settled"
    related_quest_id: str | None = None
    related_request_id: str | None = None
    metadata: dict[str, object] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    settled_at: datetime | None = None
    idempotency_key: str


class ApiKeyCreate(BaseModel):
    name: str
    environment: str = "Development"
    models: list[str] = Field(default_factory=lambda: ["devquest-fast"], min_length=1)
    spending_limit: int = 500
    expires_at: str | None = None
    ip_allowlist: list[str] = Field(default_factory=list)


class ApiKeyRename(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class ApiKeyPublic(BaseModel):
    id: str
    name: str
    prefix: str
    environment: str
    models: list[str]
    spending_limit: int
    credits_used: int = 0
    remaining_credit_limit: int = 0
    last_used_at: str | None = None
    created_at: str | None = None
    status: str = "active"


class ApiKeyCreated(BaseModel):
    raw_key: str
    record: ApiKeyPublic


class QuestVerificationInput(BaseModel):
    user_id: str
    quest_id: str
    verifier_type: str
    evidence: dict[str, object] = Field(default_factory=dict)


class QuestVerificationResult(BaseModel):
    verified: bool
    status: str
    reason: str | None = None
    evidence: dict[str, object] = Field(default_factory=dict)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    stream: bool = False
    temperature: float = 0.4
    max_tokens: int | None = None
    tools: list[dict[str, Any]] = Field(default_factory=list)
    tool_choice: str | dict[str, Any] | None = None


class ResponsesCreateRequest(BaseModel):
    model: str
    input: str | list[Any] | None = None
    instructions: str | None = None
    stream: bool = False
    temperature: float = 0.4
    max_output_tokens: int | None = None
    tools: list[dict[str, Any]] = Field(default_factory=list)
    tool_choice: str | dict[str, Any] | None = None
    previous_response_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AiToolRequest(BaseModel):
    tool: str = Field(pattern=r"^(prompt_optimizer|test_generator|workflow_blueprint|integration_snippet)$")
    input: str = Field(min_length=10, max_length=12000)
    model: str | None = None
    context: str | None = Field(default=None, max_length=8000)


class ModelAlias(BaseModel):
    id: str
    object: str = "model"
    owned_by: str = "devquest"
    availability: str = "available"
    credit_multiplier: float = 1.0
    upstream_model: str | None = None


class GitHubUser(BaseModel):
    id: str
    github_id: int
    login: str
    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None
    html_url: str | None = None
    account_role: str = "developer"
    sponsor_name: str | None = None
    developer_level: str = "rookie"


class ReferralRecord(BaseModel):
    id: str
    referrer_user_id: str
    referred_user_id: str
    referred_login: str
    reward_credits: int = 100
    status: str = "pending"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    connected_at: datetime | None = None
    awarded_at: datetime | None = None


class ReferralClick(BaseModel):
    click_id: str
    referral_code: str
    referrer_user_id: str
    ip_hash: str | None = None
    user_agent: str | None = None
    converted: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    converted_at: datetime | None = None


class AdminUser(BaseModel):
    username: str
    password_hash: str
    role: str = "admin"
    display_name: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AdminLogin(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=400)


class UserRoleUpdate(BaseModel):
    account_role: str = Field(pattern=r"^(developer|sponsor)$")
    sponsor_name: str | None = Field(default=None, max_length=120)


class ApprovedRepository(BaseModel):
    id: str
    owner: str
    name: str
    url: str
    description: str = ""
    avatar_url: str | None = None
    reward_credits: int = 200
    current_star_count: int | None = None
    star_target: int | None = None
    target_bonus_calls: int | None = None
    total_campaign_credits: int | None = None
    campaign_start_date: str | None = None
    campaign_end_date: str | None = None
    status: str = "active"
    sponsor_name: str | None = None


class RepositoryCampaignCreate(BaseModel):
    owner: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    url: str | None = Field(default=None, pattern=r"^https://github\.com/[^/\s]+/[^/\s]+/?$")
    description: str = ""
    avatar_url: str | None = None
    current_star_count: int | None = None
    star_target: int | None = None
    target_bonus_calls: int | None = None
    total_campaign_credits: int | None = None
    campaign_start_date: str | None = None
    campaign_end_date: str | None = None
    status: str = "active"
    sponsor_name: str | None = None


class RepositoryEntitlement(BaseModel):
    user_id: str
    repository_id: str
    status: str = "pending"
    reward_credits: int = 200
    reward_awarded: bool = False
    last_verified_at: datetime | None = None
    next_verification_at: datetime | None = None
    last_error: str | None = None


class RepositoryView(BaseModel):
    repository: ApprovedRepository
    verification_status: str = "pending"
    user_star_status: str = "not_starred"
    reward_awarded: bool = False
    last_verified_at: datetime | None = None
    next_verification_at: datetime | None = None


class PullRequestCampaign(BaseModel):
    id: str
    owner: str
    name: str
    url: str
    description: str = ""
    reward_credits: int = 150
    status: str = "active"
    sponsor_name: str | None = None


class PullRequestCampaignCreate(BaseModel):
    owner: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    url: str | None = Field(default=None, pattern=r"^https://github\.com/[^/\s]+/[^/\s]+/?$")
    description: str = ""
    reward_credits: int = Field(default=150, ge=1, le=100000)
    status: str = "active"
    sponsor_name: str | None = None


class PullRequestReward(BaseModel):
    id: str
    user_id: str
    campaign_id: str
    pull_request_url: str
    pull_request_number: int
    repository: str
    status: str = "pending"
    reward_credits: int = 150
    reward_awarded: bool = False
    reason: str | None = None
    merged_at: datetime | None = None
    verified_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PullRequestVerificationInput(BaseModel):
    pull_request_url: str = Field(pattern=r"^https://github\.com/[^/\s]+/[^/\s]+/pull/[0-9]+/?$")


class IssueBountyCreate(BaseModel):
    owner: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    issue_number: int = Field(ge=1)
    title: str = Field(min_length=2, max_length=180)
    description: str = Field(default="", max_length=2000)
    reward_credits: int = Field(default=500, ge=1, le=100000)
    kind: str = Field(default="fix_bug", max_length=80)
    status: str = "active"
    sponsor_name: str | None = Field(default=None, max_length=120)
    deadline: str | None = Field(default=None, max_length=80)


class IssueBounty(BaseModel):
    id: str
    owner: str
    name: str
    issue_number: int
    issue_url: str
    title: str
    description: str = ""
    reward_credits: int = 500
    kind: str = "fix_bug"
    status: str = "active"
    sponsor_name: str | None = None
    deadline: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class IssueBountyReward(BaseModel):
    id: str
    user_id: str
    bounty_id: str
    pull_request_url: str
    pull_request_number: int
    issue_number: int
    repository: str
    status: str = "pending"
    reward_credits: int = 500
    reward_awarded: bool = False
    reason: str | None = None
    merged_at: datetime | None = None
    verified_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class IssueBountyVerificationInput(BaseModel):
    bounty_id: str = Field(min_length=1, max_length=160)
    pull_request_url: str = Field(pattern=r"^https://github\.com/[^/\s]+/[^/\s]+/pull/[0-9]+/?$")


class MarketplacePurchaseInput(BaseModel):
    item_id: str = Field(min_length=1, max_length=120)


class SponsorSubmissionCreate(BaseModel):
    sponsor_name: str = Field(min_length=2, max_length=120)
    contact_name: str = Field(min_length=2, max_length=120)
    work_email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    repository_url: str = Field(pattern=r"^https://github\.com/[^/\s]+/[^/\s]+/?$")
    repository_description: str = Field(min_length=20, max_length=2000)
    legitimacy_reason: str = Field(min_length=20, max_length=2000)
    requested_campaign_duration: str = Field(min_length=2, max_length=120)
    requested_user_target: str = Field(min_length=1, max_length=80)
    proposed_reward: str = Field(min_length=1, max_length=80)
    company_website: str | None = Field(default=None, pattern=r"^https?://[^\s]+$")
    additional_notes: str | None = Field(default=None, max_length=2000)
    public_listing_consent: bool = False
    review_fee_amount_inr: int = Field(default=100, ge=0, le=1000000)
    payment_transaction_id: str | None = Field(default=None, max_length=160)


class SponsorPortalCampaignCreate(BaseModel):
    sponsor_name: str = Field(min_length=2, max_length=120)
    contact_name: str = Field(min_length=2, max_length=120)
    work_email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    repository_url: str = Field(pattern=r"^https://github\.com/[^/\s]+/[^/\s]+/?$")
    repository_description: str = Field(min_length=20, max_length=2000)
    star_target: int = Field(ge=1, le=1000000)
    pr_bounty_budget: int = Field(ge=0, le=100000000)
    issue_bounty_budget: int = Field(default=0, ge=0, le=100000000)
    campaign_duration_days: int = Field(default=30, ge=1, le=365)
    company_website: str | None = Field(default=None, pattern=r"^https?://[^\s]+$")
    approval_notes: str | None = Field(default=None, max_length=2000)


class SponsorSubmission(BaseModel):
    id: str
    status: str = "pending_review"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    payload: SponsorSubmissionCreate


class WorkflowNodePosition(BaseModel):
    x: float = 0
    y: float = 0


class WorkflowNode(BaseModel):
    id: str
    type: str
    title: str
    subtitle: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    position: WorkflowNodePosition = Field(default_factory=WorkflowNodePosition)


class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str
    source_handle: str | None = None
    target_handle: str | None = None


class WorkflowUpsert(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    status: str = "draft"
    nodes: list[WorkflowNode] = Field(default_factory=list)
    edges: list[WorkflowEdge] = Field(default_factory=list)


class Workflow(BaseModel):
    id: str
    user_id: str
    name: str
    status: str = "draft"
    nodes: list[WorkflowNode] = Field(default_factory=list)
    edges: list[WorkflowEdge] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_executed_at: datetime | None = None


class WorkflowExecutionStep(BaseModel):
    node_id: str
    node_title: str
    status: str = "success"
    message: str
    duration_ms: int = 0


class WorkflowExecution(BaseModel):
    id: str
    workflow_id: str
    user_id: str
    status: str = "success"
    credits_charged: int = 1
    started_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: datetime | None = None
    steps: list[WorkflowExecutionStep] = Field(default_factory=list)


class WorkflowCredentialCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: str = "mongodb"
    secret: str = Field(min_length=8, max_length=4000)
    metadata: dict[str, Any] = Field(default_factory=dict)


class WorkflowCredential(BaseModel):
    id: str
    user_id: str
    name: str
    kind: str = "mongodb"
    secret_hash: str
    fingerprint: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_used_at: datetime | None = None


class WorkflowCredentialPublic(BaseModel):
    id: str
    name: str
    kind: str
    fingerprint: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    last_used_at: datetime | None = None
