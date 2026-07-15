from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(ROOT_ENV, override=False)

SESSION_COOKIE = "devquest_session"
ADMIN_SESSION_COOKIE = "devquest_admin_session"
OAUTH_STATE_COOKIE = "devquest_oauth_state"
REFERRAL_COOKIE = "devquest_referral"
REFERRAL_CLICK_COOKIE = "devquest_referral_click"
STAR_RECHECK_SECONDS = 600
MIN_GATEWAY_INPUT_CHARS = 1_000_000


@dataclass(frozen=True)
class Settings:
    app_url: str
    api_url: str
    github_client_id: str
    github_client_secret: str
    max_requests_per_minute: int
    max_requests_per_day: int
    max_concurrent_requests: int
    max_input_chars: int
    max_models_per_key: int
    max_credits_per_request: int
    referral_reward_credits: int
    admin_password_pepper: str
    sponsor_review_fee_inr: int
    sponsor_payment_qr_url: str
    sponsor_payment_upi_id: str
    sponsor_payment_recipient: str

    @property
    def secure_cookie(self) -> bool:
        return self.app_url.startswith("https://")

    @property
    def session_cookie_samesite(self) -> str:
        app_host = urlparse(self.app_url).hostname
        api_host = urlparse(self.api_url).hostname
        if self.secure_cookie and app_host and api_host and app_host != api_host:
            return "none"
        return "lax"


def load_settings() -> Settings:
    configured_max_input_chars = int(os.getenv("DEVQUEST_MAX_INPUT_CHARS", str(MIN_GATEWAY_INPUT_CHARS)))
    return Settings(
        app_url=os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000").rstrip("/"),
        api_url=os.getenv("NEXT_PUBLIC_API_URL", "http://localhost:8000").rstrip("/"),
        github_client_id=os.getenv("GITHUB_CLIENT_ID", ""),
        github_client_secret=os.getenv("GITHUB_CLIENT_SECRET", ""),
        max_requests_per_minute=int(os.getenv("DEVQUEST_MAX_REQUESTS_PER_MINUTE", "5")),
        max_requests_per_day=int(os.getenv("DEVQUEST_MAX_REQUESTS_PER_DAY", "100")),
        max_concurrent_requests=int(os.getenv("DEVQUEST_MAX_CONCURRENT_REQUESTS", "1")),
        max_input_chars=max(configured_max_input_chars, MIN_GATEWAY_INPUT_CHARS),
        max_models_per_key=int(os.getenv("DEVQUEST_MAX_MODELS_PER_KEY", "1")),
        max_credits_per_request=int(os.getenv("DEVQUEST_MAX_CREDITS_PER_REQUEST", "2")),
        referral_reward_credits=int(os.getenv("DEVQUEST_REFERRAL_REWARD_CREDITS", "100")),
        admin_password_pepper=os.getenv("DEVQUEST_ADMIN_PASSWORD_PEPPER", os.getenv("SESSION_SECRET", "replace-with-32-random-bytes")),
        sponsor_review_fee_inr=int(os.getenv("DEVQUEST_SPONSOR_REVIEW_FEE_INR", "100")),
        sponsor_payment_qr_url=os.getenv("DEVQUEST_SPONSOR_PAYMENT_QR_URL", ""),
        sponsor_payment_upi_id=os.getenv("DEVQUEST_SPONSOR_PAYMENT_UPI_ID", ""),
        sponsor_payment_recipient=os.getenv("DEVQUEST_SPONSOR_PAYMENT_RECIPIENT", "DevQuest AI"),
    )


settings = load_settings()
