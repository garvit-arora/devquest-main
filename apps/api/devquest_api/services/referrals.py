from __future__ import annotations

import hashlib
from datetime import datetime
from uuid import uuid4

from .. import state
from ..config import settings
from ..deps import add_notification
from ..models import GitHubUser, LedgerType, ReferralClick, ReferralRecord
from ..referral_store import save_referral, save_referral_click

REFERRAL_TIERS = [
    {"referrals": 1, "bonus_credits": 0, "badge": "First referral", "unlock": "Base referral reward"},
    {"referrals": 5, "bonus_credits": 750, "badge": "Connector", "unlock": "750 bonus credits"},
    {"referrals": 10, "bonus_credits": 0, "badge": "Network Builder", "unlock": "Higher model and rate limits"},
    {"referrals": 25, "bonus_credits": 0, "badge": "Partner", "unlock": "Partner badge"},
]


def referral_code_for_user_id(user_id: str) -> str:
    return hashlib.sha256(f"devquest-referral:{user_id}".encode("utf-8")).hexdigest()[:14]


def referral_url_for_user_id(user_id: str) -> str:
    return f"{settings.app_url}/r/{referral_code_for_user_id(user_id)}"


def referrer_for_code(code: str | None) -> GitHubUser | None:
    if not code:
        return None
    clean = code.strip()
    if not clean:
        return None
    for user in state.github_users.values():
        if referral_code_for_user_id(user.id) == clean:
            return user
    return None


def create_referral_click(referral_code: str, *, ip: str | None = None, user_agent: str | None = None) -> ReferralClick | None:
    referrer = referrer_for_code(referral_code)
    if not referrer:
        return None
    click = ReferralClick(
        click_id=f"rclk_{uuid4().hex}",
        referral_code=referral_code,
        referrer_user_id=referrer.id,
        ip_hash=hash_ip(ip),
        user_agent=(user_agent or "")[:400] or None,
    )
    state.referral_clicks[click.click_id] = click
    save_referral_click(click)
    return click


def record_pending_referral_from_click(click_id: str | None, referred_user: GitHubUser, *, is_new_user: bool) -> ReferralRecord | None:
    if not is_new_user:
        return None
    click = state.referral_clicks.get(click_id or "")
    if not click or click.converted:
        return None
    referrer = state.github_users.get(click.referrer_user_id)
    if not referrer or referrer.id == referred_user.id:
        return None

    key = f"{referrer.id}:{referred_user.id}"
    if key in state.referrals:
        click.converted = True
        click.converted_at = datetime.utcnow()
        save_referral_click(click)
        return state.referrals[key]

    record = ReferralRecord(
        id=f"ref_{uuid4().hex[:12]}",
        referrer_user_id=referrer.id,
        referred_user_id=referred_user.id,
        referred_login=referred_user.login,
        reward_credits=settings.referral_reward_credits,
        status="pending",
    )
    state.referrals[key] = record
    save_referral(record)
    click.converted = True
    click.converted_at = datetime.utcnow()
    save_referral_click(click)
    return record


def award_pending_referral_after_github_connect(referred_user: GitHubUser) -> ReferralRecord | None:
    if referred_user.id not in state.github_tokens:
        return None
    record = next((item for item in state.referrals.values() if item.referred_user_id == referred_user.id), None)
    if not record:
        return None
    if record.status == "settled":
        return record
    if record.referrer_user_id == referred_user.id:
        return None

    key = f"{record.referrer_user_id}:{record.referred_user_id}"
    try:
        state.ledger.append(
            user_id=record.referrer_user_id,
            amount=record.reward_credits,
            transaction_type=LedgerType.referral_bonus,
            idempotency_key=f"referral:{key}",
            metadata={"referred_user_id": referred_user.id, "referred_login": referred_user.login, "source": "referral"},
        )
    except ValueError as exc:
        if "duplicate ledger transaction" not in str(exc):
            raise
    record.status = "settled"
    record.connected_at = datetime.utcnow()
    record.awarded_at = datetime.utcnow()
    record.referred_login = referred_user.login
    state.referrals[key] = record
    save_referral(record)
    award_referral_tier_bonuses(record.referrer_user_id)
    add_notification(record.referrer_user_id, "Referral reward unlocked", f"{referred_user.login} connected GitHub. {record.reward_credits} credits were added.")
    return record


def award_referral_click_if_eligible(click_id: str | None, referred_user: GitHubUser, *, is_new_user: bool) -> ReferralRecord | None:
    record_pending_referral_from_click(click_id, referred_user, is_new_user=is_new_user)
    return award_pending_referral_after_github_connect(referred_user)


def award_referral_if_eligible(referral_code: str | None, referred_user: GitHubUser, *, is_new_user: bool) -> ReferralRecord | None:
    click = create_referral_click(referral_code or "")
    return award_referral_click_if_eligible(click.click_id if click else None, referred_user, is_new_user=is_new_user)


def referrals_for_user(user_id: str) -> list[ReferralRecord]:
    return [record for record in state.referrals.values() if record.referrer_user_id == user_id]


def referral_tier_summary(user_id: str) -> dict[str, object]:
    settled_count = len([record for record in referrals_for_user(user_id) if record.status == "settled"])
    tiers = []
    for tier in REFERRAL_TIERS:
        referrals_required = int(tier["referrals"])
        tiers.append(
            {
                **tier,
                "unlocked": settled_count >= referrals_required,
                "remaining": max(0, referrals_required - settled_count),
                "bonus_claimed": tier_bonus_claimed(user_id, referrals_required),
            }
        )
    current = next((tier for tier in reversed(tiers) if tier["unlocked"]), tiers[0])
    next_tier = next((tier for tier in tiers if not tier["unlocked"]), None)
    return {"settled_referrals": settled_count, "current_tier": current, "next_tier": next_tier, "tiers": tiers}


def award_referral_tier_bonuses(referrer_user_id: str) -> None:
    settled_count = len([record for record in referrals_for_user(referrer_user_id) if record.status == "settled"])
    for tier in REFERRAL_TIERS:
        referrals_required = int(tier["referrals"])
        bonus_credits = int(tier["bonus_credits"])
        if bonus_credits <= 0 or settled_count < referrals_required or tier_bonus_claimed(referrer_user_id, referrals_required):
            continue
        state.ledger.append(
            user_id=referrer_user_id,
            amount=bonus_credits,
            transaction_type=LedgerType.referral_tier_bonus,
            idempotency_key=f"referral-tier:{referrer_user_id}:{referrals_required}",
            metadata={"source": "referral", "tier_referrals": referrals_required, "badge": tier["badge"]},
        )
        add_notification(referrer_user_id, "Referral tier bonus unlocked", f"{bonus_credits} credits awarded for reaching {referrals_required} successful referrals.")


def tier_bonus_claimed(user_id: str, referrals_required: int) -> bool:
    return any(
        record.user_id == user_id
        and record.type == LedgerType.referral_tier_bonus
        and int(record.metadata.get("tier_referrals", 0)) == referrals_required
        for record in state.ledger.records
    )


def hash_ip(ip: str | None) -> str | None:
    if not ip:
        return None
    return hashlib.sha256(f"{settings.admin_password_pepper}:{ip}".encode("utf-8")).hexdigest()
