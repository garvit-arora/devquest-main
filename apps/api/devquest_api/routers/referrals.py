from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse

from .. import state
from ..config import REFERRAL_CLICK_COOKIE, settings
from ..deps import require_user
from ..models import GitHubUser
from ..services.referrals import create_referral_click, referral_code_for_user_id, referral_tier_summary, referral_url_for_user_id, referrals_for_user

router = APIRouter(prefix="/api/referrals", tags=["referrals"])


@router.get("")
async def referral_summary(user: GitHubUser = Depends(require_user)) -> dict[str, object]:
    records = referrals_for_user(user.id)
    settled_records = [record for record in records if record.status == "settled"]
    pending_records = [record for record in records if record.status != "settled"]
    return {
        "referral_code": referral_code_for_user_id(user.id),
        "referral_url": referral_url_for_user_id(user.id),
        "reward_credits": settings.referral_reward_credits,
        "successful_referrals": len(settled_records),
        "pending_referrals": len(pending_records),
        "earned_credits": sum(record.reward_credits for record in settled_records),
        "tiers": referral_tier_summary(user.id),
        "balance": state.ledger.balance(user.id),
        "data": [record.model_dump(mode="json") for record in records],
    }


@router.get("/click/{referral_code}")
async def record_referral_click(referral_code: str, request: Request) -> RedirectResponse:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    ip = forwarded_for.split(",")[0].strip() or (request.client.host if request.client else None)
    click = create_referral_click(referral_code, ip=ip, user_agent=request.headers.get("user-agent"))
    response = RedirectResponse(f"{settings.app_url}/signin")
    if click:
        response.set_cookie(
            REFERRAL_CLICK_COOKIE,
            click.click_id,
            httponly=True,
            secure=settings.secure_cookie,
            samesite="lax",
            max_age=60 * 60 * 24 * 30,
        )
    return response
