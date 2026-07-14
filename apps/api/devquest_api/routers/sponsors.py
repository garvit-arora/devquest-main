from __future__ import annotations

from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import state
from ..activity_store import save_sponsor_submission
from ..azure_services import send_sponsor_submission_email
from ..config import settings
from ..deps import require_user
from ..models import GitHubUser, SponsorPortalCampaignCreate, SponsorSubmission, SponsorSubmissionCreate

router = APIRouter(prefix="/api/sponsors", tags=["sponsors"])


def require_sponsor_user(user: GitHubUser = Depends(require_user)) -> GitHubUser:
    if user.account_role != "sponsor":
        raise HTTPException(status_code=403, detail="sponsor access requires admin approval")
    return user


def sponsor_matches_user(user: GitHubUser, sponsor_name: str | None, repository_url: str | None = None) -> bool:
    values = {user.login.lower()}
    if user.name:
        values.add(user.name.lower())
    if user.sponsor_name:
        values.add(user.sponsor_name.lower())
    if user.email:
        values.add(user.email.lower())
    sponsor = (sponsor_name or "").lower()
    if sponsor and sponsor in values:
        return True
    if repository_url:
        return any(
            item.payload.repository_url.rstrip("/").lower() == repository_url.rstrip("/").lower()
            for item in state.sponsor_submissions.values()
            if item.payload.work_email.lower() in values or item.payload.sponsor_name.lower() in values
        )
    return False


@router.post("")
async def create_sponsor_submission(input: SponsorSubmissionCreate, request: Request) -> dict[str, object]:
    ip = request.client.host if request.client else "unknown"
    duplicate = next((item for item in state.sponsor_submissions.values() if item.payload.repository_url == input.repository_url and item.payload.work_email == input.work_email), None)
    if duplicate:
        return {"status": "already_submitted", "submission_id": duplicate.id}
    submission = SponsorSubmission(id=f"sub_{uuid4().hex[:12]}", payload=input)
    state.sponsor_submissions[submission.id] = submission
    save_sponsor_submission(submission)
    await send_sponsor_submission_email(submission.model_dump(mode="json") | {"ip": ip})
    return {"status": submission.status, "submission_id": submission.id}


@router.get("/review-fee")
async def sponsor_review_fee() -> dict[str, object]:
    upi_uri = ""
    qr_image_url = settings.sponsor_payment_qr_url
    if settings.sponsor_payment_upi_id:
        upi_uri = (
            f"upi://pay?pa={settings.sponsor_payment_upi_id}"
            f"&pn={quote(settings.sponsor_payment_recipient)}"
            f"&am={settings.sponsor_review_fee_inr}&cu=INR&tn=DevQuest%20sponsor%20review"
        )
        if not qr_image_url:
            qr_image_url = f"https://api.qrserver.com/v1/create-qr-code/?size=220x220&data={quote(upi_uri, safe='')}"
    return {
        "amount_inr": settings.sponsor_review_fee_inr,
        "currency": "INR",
        "qr_image_url": qr_image_url,
        "upi_uri": upi_uri,
        "refund_policy": "If the submission is rejected during admin review, the review fee will be refunded.",
    }


@router.get("/portal")
async def sponsor_portal(user: GitHubUser = Depends(require_sponsor_user)) -> dict[str, object]:
    campaigns = []
    for repo in state.repositories.values():
        if not sponsor_matches_user(user, repo.sponsor_name, repo.url):
            continue
        entitlements = [item for item in state.entitlements.values() if item.repository_id == repo.id]
        verified = [item for item in entitlements if item.status == "verified"]
        awarded = [item for item in verified if item.reward_awarded]
        pr_rewards = [item for item in state.pull_request_rewards.values() if item.repository == repo.id]
        issue_rewards = [item for item in state.issue_bounty_rewards.values() if item.repository == repo.id]
        target = repo.star_target or len(awarded)
        campaigns.append(
            {
                "id": repo.id,
                "sponsor_name": repo.sponsor_name,
                "repository": f"{repo.owner}/{repo.name}",
                "repository_url": repo.url,
                "campaign_status": repo.status,
                "target_stars": target,
                "current_stars": repo.current_star_count if repo.current_star_count is not None else len(verified),
                "reward_credits": repo.reward_credits,
                "awarded_credits": len(awarded) * repo.reward_credits,
                "pr_budget_used": sum(reward.reward_credits for reward in pr_rewards if reward.reward_awarded),
                "issue_budget_used": sum(reward.reward_credits for reward in issue_rewards if reward.reward_awarded),
                "pending_pr_approvals": len([reward for reward in pr_rewards if reward.status == "pending"]),
                "pending_issue_approvals": len([reward for reward in issue_rewards if reward.status == "pending"]),
                "campaign_deadline": repo.campaign_end_date,
            }
        )
    submissions = [
        item.model_dump(mode="json")
        for item in state.sponsor_submissions.values()
        if item.payload.work_email.lower() == (user.email or "").lower()
        or item.payload.sponsor_name.lower() in {user.login.lower(), (user.name or "").lower()}
        or f"self-serve portal user: {user.login.lower()}" in (item.payload.additional_notes or "").lower()
    ]
    return {
        "user": user.model_dump(mode="json"),
        "campaigns": campaigns,
        "submissions": submissions,
        "summary": {
            "campaigns": len(campaigns),
            "submissions": len(submissions),
            "target_stars": sum(int(item["target_stars"]) for item in campaigns),
            "awarded_credits": sum(int(item["awarded_credits"]) for item in campaigns),
            "pending_approvals": sum(int(item["pending_pr_approvals"]) + int(item["pending_issue_approvals"]) for item in campaigns),
        },
        "deposit_status": "coming_soon",
    }


@router.post("/portal/campaigns")
async def create_self_serve_campaign(input: SponsorPortalCampaignCreate, request: Request, user: GitHubUser = Depends(require_sponsor_user)) -> dict[str, object]:
    notes = [
        f"Self-serve portal user: {user.login}",
        f"Star target: {input.star_target}",
        f"PR bounty budget: {input.pr_bounty_budget}",
        f"Issue bounty budget: {input.issue_bounty_budget}",
        f"Campaign duration: {input.campaign_duration_days} days",
        input.approval_notes or "",
    ]
    mapped = SponsorSubmissionCreate(
        sponsor_name=input.sponsor_name,
        contact_name=input.contact_name,
        work_email=input.work_email,
        repository_url=input.repository_url,
        repository_description=input.repository_description,
        legitimacy_reason=f"Self-serve campaign request from {input.sponsor_name}. Repository will be reviewed before approval.",
        requested_campaign_duration=f"{input.campaign_duration_days} days",
        requested_user_target=str(input.star_target),
        proposed_reward=f"Star reward plus PR budget {input.pr_bounty_budget} credits and issue budget {input.issue_bounty_budget} credits",
        company_website=input.company_website,
        additional_notes="\n".join([line for line in notes if line]),
        public_listing_consent=True,
        review_fee_amount_inr=settings.sponsor_review_fee_inr,
    )
    return await create_sponsor_submission(mapped, request)
