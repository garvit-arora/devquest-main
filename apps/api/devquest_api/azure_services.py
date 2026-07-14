from __future__ import annotations

import asyncio
import json
import os
from threading import Thread
from typing import Any


def azure_enabled(name: str) -> bool:
    return os.getenv(name, "").strip() != ""


async def send_sponsor_submission_email(submission: dict[str, Any]) -> None:
    connection_string = os.getenv("AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING", "")
    sender = os.getenv("AZURE_COMMUNICATION_EMAIL_SENDER", "")
    recipient = os.getenv("DEVQUEST_OWNER_EMAIL", "")
    if not connection_string or not sender or not recipient:
        return

    try:
        from azure.communication.email.aio import EmailClient
    except ModuleNotFoundError as exc:
        raise RuntimeError("azure-communication-email is required for sponsor email delivery") from exc

    payload = submission["payload"]
    message = {
        "senderAddress": sender,
        "recipients": {"to": [{"address": recipient}]},
        "content": {
            "subject": f"DevQuest sponsor submission: {payload['sponsor_name']}",
            "plainText": (
                f"Submission ID: {submission['id']}\n"
                f"Sponsor: {payload['sponsor_name']}\n"
                f"Contact: {payload['contact_name']} <{payload['work_email']}>\n"
                f"Repository: {payload['repository_url']}\n"
                f"Website: {payload.get('company_website') or 'not provided'}\n"
                f"Duration: {payload['requested_campaign_duration']}\n"
                f"Target users: {payload['requested_user_target']}\n"
                f"Proposed reward: {payload['proposed_reward']}\n\n"
                f"Public listing consent: {payload.get('public_listing_consent')}\n"
                f"Review fee: INR {payload.get('review_fee_amount_inr', 100)}\n"
                f"Transaction ID: {payload.get('payment_transaction_id') or 'not provided'}\n"
                "Refund note: If rejected during review, the review fee should be refunded.\n\n"
                f"Description:\n{payload['repository_description']}\n\n"
                f"Legitimacy:\n{payload['legitimacy_reason']}\n\n"
                "Review in /admin/sponsors once admin persistence is connected."
            ),
        },
    }

    client = EmailClient.from_connection_string(connection_string)
    async with client:
        poller = await client.begin_send(message)
        await poller.result()


async def enqueue_star_verification(payload: dict[str, Any]) -> None:
    connection_string = os.getenv("AZURE_SERVICE_BUS_CONNECTION_STRING", "")
    queue_name = os.getenv("AZURE_SERVICE_BUS_STAR_QUEUE", "github-star-verification")
    if not connection_string:
        return

    try:
        from azure.servicebus.aio import ServiceBusClient
        from azure.servicebus import ServiceBusMessage
    except ModuleNotFoundError as exc:
        raise RuntimeError("azure-servicebus is required for verification queue delivery") from exc

    async with ServiceBusClient.from_connection_string(connection_string) as client:
        sender = client.get_queue_sender(queue_name=queue_name)
        async with sender:
            await sender.send_messages(ServiceBusMessage(json.dumps(payload)))


def dispatch_user_notification(user: dict[str, Any] | None, notification: dict[str, Any]) -> None:
    if not user:
        return
    if not os.getenv("AZURE_SERVICE_BUS_CONNECTION_STRING", "") and not os.getenv("AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING", ""):
        return

    def runner() -> None:
        asyncio.run(send_user_notification(user, notification))

    Thread(target=runner, daemon=True).start()


async def send_user_notification(user: dict[str, Any], notification: dict[str, Any]) -> None:
    await enqueue_user_notification({"user": user, "notification": notification})
    await send_user_notification_email(user, notification)


async def enqueue_user_notification(payload: dict[str, Any]) -> None:
    connection_string = os.getenv("AZURE_SERVICE_BUS_CONNECTION_STRING", "")
    queue_name = os.getenv("AZURE_SERVICE_BUS_NOTIFICATION_QUEUE", "devquest-user-notifications")
    if not connection_string:
        return

    try:
        from azure.servicebus.aio import ServiceBusClient
        from azure.servicebus import ServiceBusMessage
    except ModuleNotFoundError as exc:
        raise RuntimeError("azure-servicebus is required for notification queue delivery") from exc

    async with ServiceBusClient.from_connection_string(connection_string) as client:
        sender = client.get_queue_sender(queue_name=queue_name)
        async with sender:
            await sender.send_messages(ServiceBusMessage(json.dumps(payload)))


async def send_user_notification_email(user: dict[str, Any], notification: dict[str, Any]) -> None:
    connection_string = os.getenv("AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING", "")
    sender = os.getenv("AZURE_COMMUNICATION_EMAIL_SENDER", "")
    email = str(user.get("email") or "")
    if not connection_string or not sender or not email:
        return

    try:
        from azure.communication.email.aio import EmailClient
    except ModuleNotFoundError as exc:
        raise RuntimeError("azure-communication-email is required for notification email delivery") from exc

    message = {
        "senderAddress": sender,
        "recipients": {"to": [{"address": email}]},
        "content": {
            "subject": f"DevQuest: {notification['title']}",
            "plainText": f"{notification['title']}\n\n{notification['detail']}\n\nOpen DevQuest for details.",
        },
    }
    client = EmailClient.from_connection_string(connection_string)
    async with client:
        poller = await client.begin_send(message)
        await poller.result()


def read_key_vault_secret(name: str) -> str | None:
    vault_url = os.getenv("AZURE_KEY_VAULT_URL", "")
    if not vault_url:
        return None

    try:
        from azure.identity import DefaultAzureCredential
        from azure.keyvault.secrets import SecretClient
    except ModuleNotFoundError as exc:
        raise RuntimeError("azure-identity and azure-keyvault-secrets are required for Key Vault") from exc

    credential = DefaultAzureCredential()
    client = SecretClient(vault_url=vault_url, credential=credential)
    return client.get_secret(name).value
