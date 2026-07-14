import asyncio
import hashlib
import hmac
import os
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from apps.api.devquest_api import main
from apps.api.devquest_api.admin_store import hash_admin_password
from apps.api.devquest_api.routers import auth as auth_router
from apps.api.devquest_api.routers import issue_bounties as issue_bounties_router
from apps.api.devquest_api.routers import pull_requests as pull_requests_router
from apps.api.devquest_api.services import entitlements as entitlement_service
from apps.api.devquest_api.services.referrals import award_pending_referral_after_github_connect, create_referral_click, record_pending_referral_from_click, referral_code_for_user_id
from apps.api.devquest_api.key_store import api_key_document
from apps.api.devquest_api.ledger import CreditLedger
from apps.api.devquest_api.models import AdminUser, ApprovedRepository, GitHubUser, IssueBounty, LedgerType, PullRequestCampaign, PullRequestReward, QuestVerificationInput, RepositoryEntitlement, SponsorSubmission, SponsorSubmissionCreate, WorkflowExecution
from apps.api.devquest_api.repositories import load_approved_repositories
from apps.api.devquest_api.security import KeyRecord, generate_api_key, hash_api_key, sign_session, verify_api_key
from apps.api.devquest_api.verifiers import verifiers


@pytest.fixture(autouse=True)
def reset_state():
    previous_public_models = os.environ.get("DEVQUEST_PUBLIC_MODELS")
    os.environ["DEVQUEST_PUBLIC_MODELS"] = "devquest-fast,devquest-reason,devquest-code"
    main.reset_in_memory_state()
    for model in main.MODEL_REGISTRY.values():
        model.availability = "unconfigured" if not model.upstream_model else "available"
    yield
    if previous_public_models is None:
        os.environ.pop("DEVQUEST_PUBLIC_MODELS", None)
    else:
        os.environ["DEVQUEST_PUBLIC_MODELS"] = previous_public_models


def authenticated_client() -> tuple[TestClient, GitHubUser]:
    client = TestClient(main.app)
    user = GitHubUser(id="github:1", github_id=1, login="octocat", name="Octo Cat")
    main.github_users[user.id] = user
    main.github_tokens[user.id] = "gho_test"
    client.cookies.set(main.SESSION_COOKIE, sign_session(user.model_dump()))
    return client, user


def add_repo() -> ApprovedRepository:
    repo = ApprovedRepository(id="owner/repo", owner="owner", name="repo", url="https://github.com/owner/repo", reward_credits=500)
    main.repositories[repo.id] = repo
    return repo


def test_api_key_hashing_and_verification():
    raw = generate_api_key()
    digest = hash_api_key(raw)
    assert raw.startswith("dq_live_")
    assert verify_api_key(raw, digest)
    assert not verify_api_key(raw + "bad", digest)


def test_api_key_database_document_stores_hash_only():
    raw = generate_api_key()
    record = KeyRecord(
        id="key_test",
        user_id="github:1",
        name="hashed",
        prefix=raw[:12],
        key_hash=hash_api_key(raw),
        environment="Development",
        models=["devquest-code"],
        spending_limit=500,
    )

    document = api_key_document(record)

    assert document["key_hash"] == hash_api_key(raw)
    assert document["prefix"] == raw[:12]
    assert raw not in str(document)
    assert "raw_key" not in document


def test_credit_reservation_and_settlement():
    ledger = CreditLedger()
    ledger.append(user_id="u1", amount=100, transaction_type=LedgerType.repository_star_reward, idempotency_key="signup")
    reserved = ledger.reserve(user_id="u1", amount=20, request_id="req1")
    assert reserved.status == "pending"
    ledger.settle(user_id="u1", reserved=reserved, actual_amount=12, request_id="req1")
    assert ledger.balance("u1") == 88


def test_duplicate_reward_prevention():
    ledger = CreditLedger()
    ledger.append(user_id="u1", amount=100, transaction_type=LedgerType.repository_star_reward, idempotency_key="repo:u1")
    with pytest.raises(ValueError):
        ledger.append(user_id="u1", amount=100, transaction_type=LedgerType.repository_star_reward, idempotency_key="repo:u1")


def test_quest_verification_helper_still_verifies_pr_evidence():
    result = asyncio.run(
        verifiers["github_merged_pr"].verify(
            QuestVerificationInput(user_id="u1", quest_id="q1", verifier_type="github_merged_pr", evidence={"merged": True, "ci": "passed"})
        )
    )
    assert result.verified


def test_model_alias_resolution():
    client = TestClient(main.app)
    response = client.get("/v1/models")
    assert response.status_code == 200
    assert any(model["id"] == "devquest-fast" for model in response.json()["data"])
    assert all("upstream_model" not in model for model in response.json()["data"])


def test_approved_repository_campaign_fields_load_from_env(monkeypatch):
    monkeypatch.setenv(
        "DEVQUEST_APPROVED_REPOS",
        '[{"owner":"CoverFI-space","name":"Coverfi-landing","url":"https://github.com/CoverFI-space/Coverfi-landing","reward_credits":500,"current_star_count":1,"star_target":500,"target_bonus_calls":100,"status":"active"}]',
    )

    repositories = load_approved_repositories()

    assert repositories[0].id == "coverfi-space/coverfi-landing"
    assert repositories[0].current_star_count == 1
    assert repositories[0].star_target == 500
    assert repositories[0].target_bonus_calls == 100


def test_approved_repository_default_reward_is_200(monkeypatch):
    monkeypatch.setenv(
        "DEVQUEST_APPROVED_REPOS",
        '[{"owner":"owner","name":"repo","url":"https://github.com/owner/repo","status":"active"}]',
    )

    repositories = load_approved_repositories()

    assert repositories[0].reward_credits == 200


def test_projects_list_shows_configured_repo_without_auth():
    client = TestClient(main.app)
    repo = add_repo()

    response = client.get("/api/projects")

    assert response.status_code == 200
    item = response.json()["data"][0]
    assert item["repository"]["id"] == repo.id
    assert item["verification_status"] == "incomplete"
    assert item["user_star_status"] == "not_starred"


def test_dashboard_requires_real_session():
    client = TestClient(main.app)
    response = client.get("/api/dashboard")
    assert response.status_code == 401


def test_repository_star_verification_awards_once(monkeypatch):
    client, user = authenticated_client()
    repo = add_repo()

    async def verified(_user, _repo):
        return "verified"

    monkeypatch.setattr(entitlement_service, "check_github_star", verified)
    first = client.post(f"/api/projects/{repo.id}/verify")
    second = client.post(f"/api/projects/{repo.id}/verify")

    assert first.status_code == 200
    assert second.status_code == 200
    assert main.ledger.balance(user.id) == 500
    assert second.json()["project"]["verification_status"] == "verified"


def test_restar_after_unstar_never_awards_same_repo_twice(monkeypatch):
    client, user = authenticated_client()
    repo = add_repo()
    github_status = {"value": "verified"}

    async def current_status(_user, _repo):
        return github_status["value"]

    monkeypatch.setattr(entitlement_service, "check_github_star", current_status)

    first = client.post(f"/api/projects/{repo.id}/verify")
    github_status["value"] = "unstarred"
    unstarred = client.post(f"/api/projects/{repo.id}/verify")
    main.ledger.idempotency_keys.clear()
    github_status["value"] = "verified"
    restarred = client.post(f"/api/projects/{repo.id}/verify")

    repo_rewards = [
        record
        for record in main.ledger.records
        if record.user_id == user.id and record.type == LedgerType.repository_star_reward and record.related_quest_id == repo.id
    ]
    assert first.status_code == 200
    assert unstarred.json()["project"]["verification_status"] == "unstarred"
    assert restarred.json()["project"]["verification_status"] == "verified"
    assert restarred.json()["project"]["reward_awarded"] is True
    assert len(repo_rewards) == 1
    assert main.ledger.balance(user.id) == 500


def test_referral_awards_only_after_github_connect_once():
    referrer = GitHubUser(id="github:10", github_id=10, login="referrer")
    referred = GitHubUser(id="github:11", github_id=11, login="referred")
    main.github_users[referrer.id] = referrer
    code = referral_code_for_user_id(referrer.id)

    click = create_referral_click(code)
    assert click is not None
    pending = record_pending_referral_from_click(click.click_id, referred, is_new_user=True)

    assert pending is not None
    assert pending.status == "pending"
    assert main.ledger.balance(referrer.id) == 0

    main.github_users[referred.id] = referred
    main.github_tokens[referred.id] = "gho_referred"
    first = award_pending_referral_after_github_connect(referred)
    second = award_pending_referral_after_github_connect(referred)

    assert first is not None
    assert first.status == "settled"
    assert second is first
    assert main.ledger.balance(referrer.id) == 100
    assert len(main.referrals) == 1


def test_pull_request_reward_requires_merged_author_and_awards_once(monkeypatch):
    client, user = authenticated_client()
    main.pull_request_campaigns["owner/repo"] = PullRequestCampaign(id="owner/repo", owner="owner", name="repo", url="https://github.com/owner/repo")

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"user": {"login": user.login}, "merged_at": "2026-07-14T12:00:00Z", "draft": False}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def get(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr(pull_requests_router.httpx, "AsyncClient", FakeAsyncClient)

    first = client.post("/api/pull-requests/verify", json={"pull_request_url": "https://github.com/owner/repo/pull/12"})
    second = client.post("/api/pull-requests/verify", json={"pull_request_url": "https://github.com/owner/repo/pull/12"})

    assert first.status_code == 200
    assert first.json()["reward"]["status"] == "merged"
    assert first.json()["reward"]["reward_awarded"] is True
    assert second.status_code == 200
    assert main.ledger.balance(user.id) == 150
    assert len([record for record in main.ledger.records if record.type == LedgerType.pull_request_reward]) == 1


def test_credit_boost_event_adds_bonus_to_pull_request_reward(monkeypatch):
    monkeypatch.setenv("DEVQUEST_CREDIT_BOOST_EVENTS", '[{"id":"weekend-pr-rush","title":"Weekend PR Rush","kind":"pull_request","multiplier":2}]')
    client, user = authenticated_client()
    main.pull_request_campaigns["owner/repo"] = PullRequestCampaign(id="owner/repo", owner="owner", name="repo", url="https://github.com/owner/repo")

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"user": {"login": user.login}, "merged_at": "2026-07-14T12:00:00Z", "draft": False}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def get(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr(pull_requests_router.httpx, "AsyncClient", FakeAsyncClient)

    response = client.post("/api/pull-requests/verify", json={"pull_request_url": "https://github.com/owner/repo/pull/99"})

    assert response.status_code == 200
    assert main.ledger.balance(user.id) == 300
    assert len([record for record in main.ledger.records if record.type == LedgerType.credit_boost_bonus]) == 1


def test_bounty_board_lists_live_repo_pr_and_rank():
    client, user = authenticated_client()
    repo = add_repo()
    main.pull_request_campaigns["owner/repo"] = PullRequestCampaign(id="owner/repo", owner="owner", name="repo", url="https://github.com/owner/repo")
    main.entitlements[f"{user.id}:{repo.id}"] = RepositoryEntitlement(
        user_id=user.id,
        repository_id=repo.id,
        status="verified",
        reward_credits=repo.reward_credits,
        reward_awarded=True,
        last_verified_at=main.now_utc(),
    )
    main.ledger.append(
        user_id=user.id,
        amount=repo.reward_credits,
        transaction_type=LedgerType.repository_star_reward,
        idempotency_key="bounty:repo",
        related_quest_id=repo.id,
    )

    response = client.get("/api/bounties")

    assert response.status_code == 200
    payload = response.json()
    assert payload["rank"]["level"]["name"] == "Builder"
    assert main.github_users[user.id].developer_level == "builder"
    assert any(task["type"] == "star_repo" and task["status"] == "completed" for task in payload["tasks"])
    assert any(task["type"] == "merged_pr" and task["repository"] == "owner/repo" for task in payload["tasks"])
    assert payload["summary"]["live_tasks"] == 2


def test_leaderboard_sorts_real_earning_activity():
    client, user = authenticated_client()
    second_user = GitHubUser(id="github:2", github_id=2, login="builder", name="Builder")
    main.github_users[second_user.id] = second_user
    main.ledger.append(user_id=user.id, amount=200, transaction_type=LedgerType.repository_star_reward, idempotency_key="leader:one")
    main.ledger.append(user_id=second_user.id, amount=500, transaction_type=LedgerType.repository_star_reward, idempotency_key="leader:two")
    main.pull_request_rewards["pr-two"] = PullRequestReward(
        id="pr-two",
        user_id=second_user.id,
        campaign_id="owner/repo",
        pull_request_url="https://github.com/owner/repo/pull/3",
        pull_request_number=3,
        repository="owner/repo",
        status="merged",
        reward_awarded=True,
        verified_at=main.now_utc(),
    )

    response = client.get("/api/leaderboard?period=all")

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"][0]["login"] == "builder"
    assert payload["data"][0]["merged_prs"] == 1
    assert payload["data"][0]["level"]["name"] == "Builder"
    assert payload["me"]["login"] == user.login


def test_issue_bounty_verifies_merged_pr_closes_issue(monkeypatch):
    client, user = authenticated_client()
    main.issue_bounties["owner/repo#7"] = IssueBounty(
        id="owner/repo#7",
        owner="owner",
        name="repo",
        issue_number=7,
        issue_url="https://github.com/owner/repo/issues/7",
        title="Fix bug",
        reward_credits=500,
        kind="fix_issue",
    )

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "data": {
                    "repository": {
                        "pullRequest": {
                            "number": 20,
                            "merged": True,
                            "mergedAt": "2026-07-14T12:00:00Z",
                            "author": {"login": user.login},
                            "closingIssuesReferences": {"nodes": [{"number": 7, "state": "CLOSED", "url": "https://github.com/owner/repo/issues/7"}]},
                        }
                    }
                }
            }

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr(issue_bounties_router.httpx, "AsyncClient", FakeAsyncClient)

    first = client.post("/api/issue-bounties/verify", json={"bounty_id": "owner/repo#7", "pull_request_url": "https://github.com/owner/repo/pull/20"})
    second = client.post("/api/issue-bounties/verify", json={"bounty_id": "owner/repo#7", "pull_request_url": "https://github.com/owner/repo/pull/20"})

    assert first.status_code == 200
    assert first.json()["reward"]["status"] == "merged_closes_issue"
    assert first.json()["reward"]["reward_awarded"] is True
    assert second.status_code == 200
    assert main.ledger.balance(user.id) == 500
    assert len([record for record in main.ledger.records if record.type == LedgerType.issue_bounty_reward]) == 1


def test_marketplace_purchase_spends_wallet_credits():
    client, user = authenticated_client()
    main.ledger.append(user_id=user.id, amount=100, transaction_type=LedgerType.promotional_credit, idempotency_key="market:seed")

    response = client.post("/api/marketplace/purchase", json={"item_id": "workflow_execution_pack"})

    assert response.status_code == 200
    assert response.json()["balance"] == 75
    assert main.ledger.records[-1].type == LedgerType.marketplace_purchase


def test_streak_claim_awards_bonus_once():
    client, user = authenticated_client()
    for index in range(7):
        main.workflow_executions.append(
            WorkflowExecution(
                id=f"exec_{index}",
                workflow_id="wf_test",
                user_id=user.id,
                started_at=main.now_utc() - timedelta(days=index),
            )
        )

    summary = client.get("/api/streaks")
    first = client.post("/api/streaks/claim")
    second = client.post("/api/streaks/claim")

    assert summary.status_code == 200
    assert summary.json()["can_claim_bonus"] is True
    assert first.status_code == 200
    assert first.json()["balance"] == 100
    assert second.status_code == 409


def test_referral_tier_bonus_after_five_connected_referrals():
    referrer = GitHubUser(id="github:10", github_id=10, login="referrer")
    main.github_users[referrer.id] = referrer

    for index in range(5):
        referred = GitHubUser(id=f"github:{20 + index}", github_id=20 + index, login=f"referred{index}")
        click = create_referral_click(referral_code_for_user_id(referrer.id))
        assert click is not None
        record_pending_referral_from_click(click.click_id, referred, is_new_user=True)
        main.github_users[referred.id] = referred
        main.github_tokens[referred.id] = f"gho_{index}"
        award_pending_referral_after_github_connect(referred)

    client = TestClient(main.app)
    client.cookies.set(main.SESSION_COOKIE, sign_session(referrer.model_dump()))
    response = client.get("/api/referrals")

    assert response.status_code == 200
    assert response.json()["tiers"]["settled_referrals"] == 5
    assert main.ledger.balance(referrer.id) == 1250
    assert len([record for record in main.ledger.records if record.type == LedgerType.referral_tier_bonus]) == 1


def test_campaign_and_public_profile_payloads_include_proof():
    client, user = authenticated_client()
    repo = add_repo()
    main.issue_bounties["owner/repo#8"] = IssueBounty(
        id="owner/repo#8",
        owner="owner",
        name="repo",
        issue_number=8,
        issue_url="https://github.com/owner/repo/issues/8",
        title="Improve README",
        reward_credits=100,
        kind="write_docs",
    )
    main.entitlements[f"{user.id}:{repo.id}"] = RepositoryEntitlement(user_id=user.id, repository_id=repo.id, status="verified", reward_awarded=True, reward_credits=repo.reward_credits, last_verified_at=main.now_utc())
    main.ledger.append(user_id=user.id, amount=repo.reward_credits, transaction_type=LedgerType.repository_star_reward, idempotency_key="profile:repo", related_quest_id=repo.id)

    campaign = client.get(f"/api/campaigns/{repo.id}")
    profile = client.get(f"/api/profiles/{user.login}")

    assert campaign.status_code == 200
    assert campaign.json()["repository"] == "owner/repo"
    assert campaign.json()["issue_bounties"][0]["title"] == "Improve README"
    assert campaign.json()["top_contributors"][0]["login"] == user.login
    assert profile.status_code == 200
    assert profile.json()["stats"]["completed_quests"] == 1
    assert profile.json()["stats"]["credits_earned"] == repo.reward_credits


def test_referral_summary_returns_shareable_link():
    client, user = authenticated_client()

    response = client.get("/api/referrals")

    assert response.status_code == 200
    payload = response.json()
    assert payload["referral_code"] == referral_code_for_user_id(user.id)
    assert payload["referral_url"].endswith(f"/r/{payload['referral_code']}")


def test_credit_wallet_summary_categorizes_ledger_records():
    client, user = authenticated_client()
    main.ledger.append(
        user_id=user.id,
        amount=500,
        transaction_type=LedgerType.repository_star_reward,
        idempotency_key="wallet:repo",
        metadata={"owner": "owner", "name": "repo", "source": "repository"},
    )
    main.ledger.append(
        user_id=user.id,
        amount=100,
        transaction_type=LedgerType.referral_bonus,
        idempotency_key="wallet:referral",
        metadata={"source": "referral", "referred_login": "friend"},
    )
    main.ledger.append(
        user_id=user.id,
        amount=75,
        transaction_type=LedgerType.sponsor_reward,
        idempotency_key="wallet:sponsor",
        metadata={"source": "sponsor", "sponsor_name": "Acme"},
    )
    main.ledger.append(
        user_id=user.id,
        amount=-2,
        transaction_type=LedgerType.api_usage_settled,
        idempotency_key="wallet:spent",
        metadata={"model": "devquest-fast"},
    )
    main.ledger.append(
        user_id=user.id,
        amount=-25,
        transaction_type=LedgerType.reward_reversal,
        idempotency_key="wallet:revoked",
    )

    response = client.get("/api/ledger")

    assert response.status_code == 200
    payload = response.json()
    assert payload["balance"] == 648
    assert payload["summary"] == {
        "earned": 500,
        "spent": 2,
        "revoked": 25,
        "referral_bonus": 100,
        "sponsor_reward": 75,
        "pending": 0,
    }
    assert {record["category"] for record in payload["data"]} == {"earned", "spent", "revoked", "referral_bonus", "sponsor_reward"}
    assert all("remaining_balance" in record for record in payload["data"])
    assert payload["data"][-1]["remaining_balance"] == payload["balance"]


def test_admin_login_and_overview():
    client = TestClient(main.app)
    main.admin_users["owner"] = AdminUser(username="owner", password_hash=hash_admin_password("secret"), role="owner")
    main.platform_logs.appendleft({"id": "log_test", "timestamp": "2026-07-13T00:00:00", "level": "error", "event": "test_failure", "message": "Test failure", "metadata": {}})

    login = client.post("/api/admin/login", json={"username": "owner", "password": "secret"})
    overview = client.get("/api/admin/overview")

    assert login.status_code == 200
    assert overview.status_code == 200
    assert overview.json()["metrics"]["users"] == 0
    assert overview.json()["logs"][0]["event"] == "admin_login"


def test_admin_sponsor_campaigns_show_campaign_and_pending_approval():
    client = TestClient(main.app)
    main.admin_users["owner"] = AdminUser(username="owner", password_hash=hash_admin_password("secret"), role="owner")
    repo = ApprovedRepository(
        id="coverfi/landing",
        owner="CoverFI-space",
        name="Coverfi-landing",
        url="https://github.com/CoverFI-space/Coverfi-landing",
        reward_credits=500,
        current_star_count=125,
        star_target=500,
        status="active",
        sponsor_name="CoverFI",
    )
    main.repositories[repo.id] = repo
    main.entitlements["github:2:coverfi/landing"] = RepositoryEntitlement(user_id="github:2", repository_id=repo.id, status="verified", reward_awarded=True)
    main.sponsor_submissions["sub_pending"] = SponsorSubmission(
        id="sub_pending",
        payload=SponsorSubmissionCreate(
            sponsor_name="CoverFI",
            contact_name="Ada Lovelace",
            work_email="ada@example.com",
            repository_url=repo.url,
            repository_description="A legitimate open-source repository for developer tooling.",
            legitimacy_reason="The repository has public source code, maintainers, and clear project goals.",
            requested_campaign_duration="30 days",
            requested_user_target="500",
            proposed_reward="500 prompt credits",
            company_website="https://example.com",
        ),
    )

    client.post("/api/admin/login", json={"username": "owner", "password": "secret"})
    response = client.get("/api/admin/sponsor-campaigns")

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["active_campaigns"] == 1
    assert payload["summary"]["target_stars"] == 500
    assert payload["summary"]["current_stars"] == 125
    assert payload["summary"]["cost_estimate"] == 250000
    assert payload["campaigns"][0]["pending_approval"] == 1
    assert payload["campaigns"][0]["awarded_credits"] == 500


def test_admin_can_create_repository_and_pr_campaigns_without_env():
    client = TestClient(main.app)
    main.admin_users["owner"] = AdminUser(username="owner", password_hash=hash_admin_password("secret"), role="owner")
    client.post("/api/admin/login", json={"username": "owner", "password": "secret"})

    repo_response = client.post(
        "/api/projects/admin",
        json={
            "owner": "NewOrg",
            "name": "new-repo",
            "description": "A real sponsor repository added through the backend.",
            "star_target": 500,
            "target_bonus_calls": 100,
            "sponsor_name": "New Sponsor",
        },
    )
    pr_response = client.post(
        "/api/pull-requests/admin",
        json={
            "owner": "NewOrg",
            "name": "new-repo",
            "description": "Meaningful merged PR rewards.",
            "reward_credits": 150,
            "sponsor_name": "New Sponsor",
        },
    )
    projects = client.get("/api/projects")
    pull_requests = client.get("/api/pull-requests")

    assert repo_response.status_code == 200
    assert repo_response.json()["id"] == "neworg/new-repo"
    assert main.repositories["neworg/new-repo"].sponsor_name == "New Sponsor"
    assert pr_response.status_code == 200
    assert pr_response.json()["id"] == "neworg/new-repo"
    assert main.pull_request_campaigns["neworg/new-repo"].description == "Meaningful merged PR rewards."
    assert any(item["repository"]["id"] == "neworg/new-repo" for item in projects.json()["data"])
    assert any(item["id"] == "neworg/new-repo" for item in pull_requests.json()["data"])


def test_confirmed_unstar_blocks_gateway(monkeypatch):
    client, user = authenticated_client()
    repo = add_repo()

    async def verified(_user, _repo):
        return "verified"

    monkeypatch.setattr(entitlement_service, "check_github_star", verified)
    client.post(f"/api/projects/{repo.id}/verify")
    created = client.post("/api/api-keys", json={"name": "test", "models": ["devquest-fast"]}).json()
    raw = created["raw_key"]

    async def unstarred(_user, _repo):
        return "unstarred"

    entitlement = main.entitlements[f"{user.id}:{repo.id}"]
    entitlement.next_verification_at = main.now_utc()
    monkeypatch.setattr(entitlement_service, "check_github_star", unstarred)

    response = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {raw}"},
        json={"model": "devquest-fast", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["error"]["code"] == "repository_star_required"


def test_gateway_rejects_invalid_key():
    client = TestClient(main.app)
    response = client.post("/v1/chat/completions", json={"model": "devquest-fast", "messages": [{"role": "user", "content": "hi"}]})
    assert response.status_code == 401


def test_create_rename_rotate_and_revoke_key(monkeypatch):
    client, _user = authenticated_client()
    add_repo()

    async def verified(_user, _repo):
        return "verified"

    monkeypatch.setattr(entitlement_service, "check_github_star", verified)
    client.post("/api/projects/owner/repo/verify")

    created_response = client.post("/api/api-keys", json={"name": "restricted", "models": ["devquest-fast"]})
    assert created_response.status_code == 200
    created = created_response.json()
    raw = created["raw_key"]

    renamed = client.patch(f"/api/api-keys/{created['record']['id']}", json={"name": "renamed"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "renamed"

    rotated = client.post(f"/api/api-keys/{created['record']['id']}/rotate")
    assert rotated.status_code == 200
    assert rotated.json()["raw_key"] != raw

    revoked = client.delete(f"/api/api-keys/{created['record']['id']}")
    assert revoked.status_code == 200
    assert revoked.json()["status"] == "revoked"

    rejected = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {rotated.json()['raw_key']}"},
        json={"model": "devquest-fast", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert rejected.status_code == 401


def test_key_model_restriction(monkeypatch):
    client, _user = authenticated_client()
    add_repo()

    async def verified(_user, _repo):
        return "verified"

    monkeypatch.setattr(entitlement_service, "check_github_star", verified)
    client.post("/api/projects/owner/repo/verify")
    main.MODEL_REGISTRY["devquest-code"].availability = "available"
    main.MODEL_REGISTRY["devquest-code"].upstream_model = "azure-code"
    created = client.post("/api/api-keys", json={"name": "restricted", "models": ["devquest-fast"]}).json()

    restricted = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {created['raw_key']}"},
        json={"model": "devquest-code", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert restricted.status_code == 403


def test_api_key_allows_at_most_three_models(monkeypatch):
    client, _user = authenticated_client()
    add_repo()

    async def verified(_user, _repo):
        return "verified"

    monkeypatch.setattr(entitlement_service, "check_github_star", verified)
    client.post("/api/projects/owner/repo/verify")

    accepted = client.post(
        "/api/api-keys",
        json={"name": "three models", "models": ["devquest-fast", "devquest-reason", "devquest-code"]},
    )
    rejected = client.post(
        "/api/api-keys",
        json={"name": "too many", "models": ["devquest-fast", "devquest-reason", "devquest-code", "devquest-deepseek"]},
    )
    assert accepted.status_code == 200
    assert accepted.json()["record"]["models"] == ["devquest-fast", "devquest-reason", "devquest-code"]
    assert rejected.status_code == 400


def test_api_key_credit_limit_is_capped_by_wallet_balance(monkeypatch):
    client, _user = authenticated_client()
    add_repo()

    async def verified(_user, _repo):
        return "verified"

    monkeypatch.setattr(entitlement_service, "check_github_star", verified)
    client.post("/api/projects/owner/repo/verify")

    created = client.post(
        "/api/api-keys",
        json={"name": "wallet capped", "models": ["devquest-fast"], "spending_limit": 9999},
    )

    assert created.status_code == 200
    assert created.json()["record"]["spending_limit"] == 500


def test_workflow_create_execute_and_history(monkeypatch):
    client, user = authenticated_client()
    add_repo()

    async def verified(_user, _repo):
        return "verified"

    monkeypatch.setattr(entitlement_service, "check_github_star", verified)
    client.post("/api/projects/owner/repo/verify")

    created = client.post(
        "/api/workflows",
        json={
            "name": "Ship reward flow",
            "status": "draft",
            "nodes": [
                {"id": "trigger", "type": "manual_trigger", "title": "Manual Trigger", "position": {"x": 100, "y": 100}},
                {
                    "id": "ai",
                    "type": "devquest_ai",
                    "title": "DevQuest AI",
                    "config": {"model": "devquest-fast", "thinking": "medium"},
                    "position": {"x": 420, "y": 100},
                },
            ],
            "edges": [{"id": "edge", "source": "trigger", "target": "ai"}],
        },
    )
    assert created.status_code == 200

    executed = client.post(f"/api/workflows/{created.json()['id']}/execute")
    history = client.get(f"/api/workflows/{created.json()['id']}/executions")

    assert executed.status_code == 200
    assert executed.json()["credits_charged"] == 1
    assert history.status_code == 200
    assert history.json()[0]["workflow_id"] == created.json()["id"]
    assert main.ledger.balance(user.id) == 524


def test_default_workflow_is_devquest_ai_template(monkeypatch):
    client, user = authenticated_client()
    add_repo()

    async def verified(_user, _repo):
        return "verified"

    monkeypatch.setattr(entitlement_service, "check_github_star", verified)
    client.post("/api/projects/owner/repo/verify")

    created = client.post("/api/workflows", json={"name": "AI Email Reply"})
    executed = client.post(f"/api/workflows/{created.json()['id']}/execute")

    assert created.status_code == 200
    assert [node["type"] for node in created.json()["nodes"]] == ["email_received_trigger", "devquest_ai", "email_reply"]
    assert executed.status_code == 200
    messages = [step["message"] for step in executed.json()["steps"]]
    assert any("Accepted new email" in message for message in messages)
    assert any("draft a concise email reply" in message for message in messages)
    assert any("AI drafted email reply" in message for message in messages)
    assert main.ledger.balance(user.id) == 523


def test_ready_workflow_templates_can_be_installed_for_user():
    client, _user = authenticated_client()

    listed = client.get("/api/workflows/templates")
    installed = client.post("/api/workflows/templates/install-all")
    repeated = client.post("/api/workflows/templates/install-all")

    assert listed.status_code == 200
    assert [item["title"] for item in listed.json()["data"]] == [
        "AI Email Reply",
        "Lead Scoring",
        "GitHub Issue Triage",
        "CSV Summarizer",
        "Waitlist Notifier",
        "Repo Star Tracker",
    ]
    assert installed.status_code == 200
    assert len(installed.json()) == 6
    assert len(repeated.json()) == 6
    assert len(main.workflows) == 6


def test_ready_workflow_messages_cover_email_csv_and_repo_star(monkeypatch):
    client, user = authenticated_client()
    add_repo()

    async def verified(_user, _repo):
        return "verified"

    monkeypatch.setattr(entitlement_service, "check_github_star", verified)
    client.post("/api/projects/owner/repo/verify")

    created = client.post(
        "/api/workflows",
        json={
            "name": "Ready workflow coverage",
            "nodes": [
                {"id": "email", "type": "email_received_trigger", "title": "Email Received", "config": {"inbox": "support@example.com", "subject_filter": "billing"}},
                {"id": "csv", "type": "csv_upload_trigger", "title": "CSV Uploaded", "config": {"source": "Dashboard upload", "filename_pattern": "*.csv"}},
                {"id": "star", "type": "repo_star_trigger", "title": "Repo Star Event", "config": {"repository": "owner/repo", "star_delta": "new_star", "threshold": "every star"}},
                {"id": "ai", "type": "devquest_ai", "title": "Summarize CSV", "config": {"model": "devquest-deepseek-research", "task": "summarize_csv"}},
                {"id": "reply", "type": "email_reply", "title": "Send Reply", "config": {"reply_to": "{{trigger.from}}"}},
                {"id": "notify", "type": "notify_owner", "title": "Notify Owner", "config": {"owner_email": "owner@example.com", "channel": "email + notification"}},
                {"id": "sheet", "type": "sheet_append", "title": "Save to Sheet", "config": {"provider": "Microsoft Excel", "workbook": "Reports.xlsx", "sheet": "Summaries"}},
            ],
            "edges": [],
        },
    )
    executed = client.post(f"/api/workflows/{created.json()['id']}/execute")

    assert executed.status_code == 200
    messages = [step["message"] for step in executed.json()["steps"]]
    assert any("new email" in message for message in messages)
    assert any("CSV file" in message for message in messages)
    assert any("new_star" in message for message in messages)
    assert any("summarize CSV trends" in message for message in messages)
    assert any("email reply" in message for message in messages)
    assert any("Sent email + notification alert" in message for message in messages)
    assert any("Appended AI output" in message for message in messages)
    assert executed.json()["credits_charged"] == 2
    assert main.ledger.balance(user.id) == 523


def test_gateway_charges_max_two_credits_per_request(monkeypatch):
    client, user = authenticated_client()
    add_repo()

    async def verified(_user, _repo):
        return "verified"

    async def chat_completion(_request):
        return {
            "id": "chatcmpl_test",
            "object": "chat.completion",
            "model": "devquest-fast",
            "choices": [{"message": {"role": "assistant", "content": "ok"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 10000, "completion_tokens": 10000, "total_tokens": 20000},
        }

    monkeypatch.setattr(entitlement_service, "check_github_star", verified)
    monkeypatch.setattr(main.provider, "chat_completion", chat_completion)
    main.MODEL_REGISTRY["devquest-fast"].availability = "available"
    main.MODEL_REGISTRY["devquest-fast"].upstream_model = "azure-fast"

    client.post("/api/projects/owner/repo/verify")
    created = client.post("/api/api-keys", json={"name": "metered", "models": ["devquest-fast"]}).json()

    response = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {created['raw_key']}"},
        json={"model": "devquest-fast", "messages": [{"role": "user", "content": "hi"}]},
    )

    assert response.status_code == 200
    assert main.ledger.balance(user.id) == 523
    assert main.api_request_logs[-1]["credits"] == 2
    achievements = client.get("/api/achievements")
    assert achievements.status_code == 200
    assert any(item["id"] == "first_api_request" and item["unlocked"] for item in achievements.json()["data"])


def test_ai_tools_use_provider_and_charge_credits(monkeypatch):
    client, user = authenticated_client()
    add_repo()

    async def verified(_user, _repo):
        return "verified"

    async def chat_completion(request):
        return {
            "id": "chatcmpl_ai_tool",
            "object": "chat.completion",
            "model": request.model,
            "choices": [{"message": {"role": "assistant", "content": "Optimized prompt output"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 12, "completion_tokens": 8, "total_tokens": 20},
        }

    monkeypatch.setattr(entitlement_service, "check_github_star", verified)
    monkeypatch.setattr(main.provider, "chat_completion", chat_completion)
    main.MODEL_REGISTRY["devquest-fast"].availability = "available"
    main.MODEL_REGISTRY["devquest-fast"].upstream_model = "azure-fast"

    client.post("/api/projects/owner/repo/verify")
    response = client.post(
        "/api/ai-tools/run",
        json={"tool": "prompt_optimizer", "model": "devquest-fast", "input": "Improve this customer support prompt for structured JSON output."},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["output"] == "Optimized prompt output"
    assert payload["credits_charged"] == 2
    assert payload["balance"] == 498
    assert main.api_request_logs[-1]["api_kind"] == "ai_tool"
    assert main.api_request_logs[-1]["tool"] == "prompt_optimizer"


def test_api_key_credit_usage_survives_request_log_reset(monkeypatch):
    client, _user = authenticated_client()
    add_repo()

    async def verified(_user, _repo):
        return "verified"

    async def chat_completion(_request):
        return {
            "id": "chatcmpl_test",
            "object": "chat.completion",
            "model": "devquest-fast",
            "choices": [{"message": {"role": "assistant", "content": "ok"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        }

    monkeypatch.setattr(entitlement_service, "check_github_star", verified)
    monkeypatch.setattr(main.provider, "chat_completion", chat_completion)
    main.MODEL_REGISTRY["devquest-fast"].availability = "available"
    main.MODEL_REGISTRY["devquest-fast"].upstream_model = "azure-fast"

    client.post("/api/projects/owner/repo/verify")
    created = client.post("/api/api-keys", json={"name": "metered", "models": ["devquest-fast"], "spending_limit": 2}).json()
    response = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {created['raw_key']}"},
        json={"model": "devquest-fast", "messages": [{"role": "user", "content": "hi"}]},
    )
    main.api_request_logs.clear()
    keys = client.get("/api/api-keys").json()
    blocked = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {created['raw_key']}"},
        json={"model": "devquest-fast", "messages": [{"role": "user", "content": "hi again"}]},
    )

    assert response.status_code == 200
    assert keys[0]["credits_used"] == 2
    assert keys[0]["remaining_credit_limit"] == 0
    assert blocked.status_code == 402


def test_responses_endpoint_returns_response_shape_for_codex(monkeypatch):
    client, user = authenticated_client()
    add_repo()

    async def verified(_user, _repo):
        return "verified"

    async def chat_completion(request):
        return {
            "id": "chatcmpl_responses",
            "object": "chat.completion",
            "model": request.model,
            "choices": [{"message": {"role": "assistant", "content": "Codex ready"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 11, "completion_tokens": 2, "total_tokens": 13},
        }

    monkeypatch.setattr(entitlement_service, "check_github_star", verified)
    monkeypatch.setattr(main.provider, "chat_completion", chat_completion)
    main.MODEL_REGISTRY["devquest-code"].availability = "available"
    main.MODEL_REGISTRY["devquest-code"].upstream_model = "azure-code"

    client.post("/api/projects/owner/repo/verify")
    created = client.post("/api/api-keys", json={"name": "codex", "models": ["devquest-code"]}).json()

    response = client.post(
        "/v1/responses",
        headers={"Authorization": f"Bearer {created['raw_key']}"},
        json={"model": "devquest-code", "instructions": "You help with code.", "input": "Inspect this repo."},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["object"] == "response"
    assert payload["model"] == "devquest-code"
    assert payload["output"][0]["content"][0]["text"] == "Codex ready"
    assert payload["usage"]["input_tokens"] == 11
    assert main.ledger.balance(user.id) == 573
    assert len([record for record in main.ledger.records if record.type == LedgerType.achievement_reward]) == 2


def test_responses_endpoint_streams_response_events(monkeypatch):
    client, _user = authenticated_client()
    add_repo()

    async def verified(_user, _repo):
        return "verified"

    async def stream_chat_completion(_request):
        yield 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'
        yield 'data: {"choices":[{"delta":{"content":" Codex"}}]}\n\n'
        yield "data: [DONE]\n\n"

    monkeypatch.setattr(entitlement_service, "check_github_star", verified)
    monkeypatch.setattr(main.provider, "stream_chat_completion", stream_chat_completion)
    main.MODEL_REGISTRY["devquest-code"].availability = "available"
    main.MODEL_REGISTRY["devquest-code"].upstream_model = "azure-code"

    client.post("/api/projects/owner/repo/verify")
    created = client.post("/api/api-keys", json={"name": "codex-stream", "models": ["devquest-code"]}).json()

    response = client.post(
        "/v1/responses",
        headers={"Authorization": f"Bearer {created['raw_key']}"},
        json={"model": "devquest-code", "input": "Stream please.", "stream": True},
    )

    assert response.status_code == 200
    body = response.text
    assert "event: response.created" in body
    assert "event: response.output_text.delta" in body
    assert "Hello" in body
    assert "Codex" in body
    assert "event: response.completed" in body


def test_github_temporary_failure_does_not_remove_verified_entitlement(monkeypatch):
    client, user = authenticated_client()
    repo = add_repo()

    async def verified(_user, _repo):
        return "verified"

    monkeypatch.setattr(entitlement_service, "check_github_star", verified)
    client.post(f"/api/projects/{repo.id}/verify")

    async def rate_limited(_user, _repo):
        return "github_rate_limited"

    main.entitlements[f"{user.id}:{repo.id}"].next_verification_at = main.now_utc()
    monkeypatch.setattr(entitlement_service, "check_github_star", rate_limited)
    asyncio.run(main.ensure_repository_access(user.id))
    assert main.entitlements[f"{user.id}:{repo.id}"].status == "verified"


def test_sponsor_submission_duplicate_detection():
    client = TestClient(main.app)
    payload = {
        "sponsor_name": "Real Sponsor",
        "contact_name": "Ada Lovelace",
        "work_email": "ada@example.com",
        "repository_url": "https://github.com/owner/repo",
        "repository_description": "A legitimate open-source repository for developer tooling.",
        "legitimacy_reason": "The repository has public source code, maintainers, and clear project goals.",
        "requested_campaign_duration": "30 days",
        "requested_user_target": "100",
        "proposed_reward": "500 prompt credits",
        "company_website": "https://example.com",
        "additional_notes": "",
    }
    first = client.post("/api/sponsors", json=payload)
    second = client.post("/api/sponsors", json=payload)
    assert first.status_code == 200
    assert second.json()["status"] == "already_submitted"


def test_sponsor_review_fee_configuration_is_public():
    client = TestClient(main.app)

    response = client.get("/api/sponsors/review-fee")

    assert response.status_code == 200
    assert response.json()["amount_inr"] == 100
    assert response.json()["currency"] == "INR"
    assert "refunded" in response.json()["refund_policy"]


def test_sponsor_portal_submission_accepts_targets_and_budgets():
    client, user = authenticated_client()
    user.account_role = "sponsor"
    user.sponsor_name = "Sponsor Co"
    payload = {
        "sponsor_name": "Sponsor Co",
        "contact_name": "Ada Lovelace",
        "work_email": "ada@sponsor.example",
        "repository_url": "https://github.com/owner/repo",
        "repository_description": "A legitimate open-source repository for sponsor campaign testing.",
        "star_target": 500,
        "pr_bounty_budget": 5000,
        "issue_bounty_budget": 2500,
        "campaign_duration_days": 30,
        "company_website": "https://example.com",
        "approval_notes": "Please review this self-serve campaign request.",
    }

    created = client.post("/api/sponsors/portal/campaigns", json=payload)
    portal = client.get("/api/sponsors/portal")

    assert created.status_code == 200
    assert created.json()["status"] == "pending_review"
    assert portal.status_code == 200
    assert portal.json()["summary"]["submissions"] == 1


def test_sponsor_portal_requires_admin_approved_role():
    client, _user = authenticated_client()

    response = client.get("/api/sponsors/portal")

    assert response.status_code == 403
    assert response.json()["detail"] == "sponsor access requires admin approval"


def test_admin_can_grant_sponsor_role():
    client, user = authenticated_client()
    main.admin_users["owner"] = AdminUser(username="owner", password_hash=hash_admin_password("secret"), role="owner")
    client.post("/api/admin/login", json={"username": "owner", "password": "secret"})

    response = client.patch(f"/api/admin/users/{user.id}/role", json={"account_role": "sponsor", "sponsor_name": "Sponsor Co"})

    assert response.status_code == 200
    assert response.json()["user"]["account_role"] == "sponsor"
    assert main.github_users[user.id].sponsor_name == "Sponsor Co"


def test_github_webhook_signature_and_idempotency():
    client = TestClient(main.app)
    payload = b'{"zen":"Keep it logically awesome."}'
    secret = os.getenv("GITHUB_WEBHOOK_SECRET", "devquest_dev_webhook_secret").encode("utf-8")
    signature = "sha256=" + hmac.new(secret, payload, hashlib.sha256).hexdigest()

    accepted = client.post(
        "/webhooks/github",
        content=payload,
        headers={"X-Hub-Signature-256": signature, "X-GitHub-Delivery": "delivery-test-1"},
    )
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "accepted"

    duplicate = client.post(
        "/webhooks/github",
        content=payload,
        headers={"X-Hub-Signature-256": signature, "X-GitHub-Delivery": "delivery-test-1"},
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["status"] == "duplicate_ignored"

    invalid = client.post(
        "/webhooks/github",
        content=payload,
        headers={"X-Hub-Signature-256": "sha256=bad", "X-GitHub-Delivery": "delivery-test-2"},
    )
    assert invalid.status_code == 401


def test_github_callback_success_does_not_shadow_state(monkeypatch):
    class FakeResponse:
        def __init__(self, payload, status_code=200):
            self._payload = payload
            self.status_code = status_code
            self.text = str(payload)

        def json(self):
            return self._payload

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, *args, **kwargs):
            return FakeResponse({"access_token": "gho_real_token"})

        async def get(self, url, *args, **kwargs):
            if url.endswith("/user"):
                return FakeResponse({"id": 123, "login": "octocat", "name": "Octo Cat", "avatar_url": "https://example.com/a.png", "html_url": "https://github.com/octocat"})
            return FakeResponse([{"email": "octo@example.com", "primary": True, "verified": True}])

    monkeypatch.setattr(auth_router.httpx, "AsyncClient", FakeAsyncClient)
    client = TestClient(main.app)
    client.cookies.set(main.OAUTH_STATE_COOKIE, "state-ok")

    response = client.get("/api/auth/github/callback?code=code-ok&state=state-ok", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "http://localhost:3000/app"
    assert "github:123" in main.github_users
    assert main.github_tokens["github:123"] == "gho_real_token"
    assert main.SESSION_COOKIE in response.cookies
