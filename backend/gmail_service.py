"""Gmail API integration for confirmed email sending."""

import base64
from email.message import EmailMessage
from email.utils import parseaddr

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from auth import (
    GMAIL_SEND_SCOPE,
    PROVIDER,
    SCOPES,
)
from db import (
    get_oauth_token,
    save_oauth_token,
)


def get_credentials(
    user_id: str,
) -> Credentials | None:
    """Load and refresh the user's Google credentials."""
    token = get_oauth_token(
        user_id,
        PROVIDER,
    )

    if token is None:
        return None

    credentials = (
        Credentials.from_authorized_user_info(
            token,
            SCOPES,
        )
    )

    if (
        credentials.expired
        and credentials.refresh_token
    ):
        credentials.refresh(Request())

        save_oauth_token(
            user_id=user_id,
            provider=PROVIDER,
            token={
                "token": credentials.token,
                "refresh_token": (
                    credentials.refresh_token
                ),
                "token_uri": (
                    credentials.token_uri
                ),
                "client_id": (
                    credentials.client_id
                ),
                "client_secret": (
                    credentials.client_secret
                ),
                "scopes": list(
                    credentials.scopes or SCOPES
                ),
                "expiry": (
                    credentials.expiry.isoformat()
                    if credentials.expiry
                    else None
                ),
            },
        )

    return credentials


def is_gmail_connected(
    user_id: str,
) -> bool:
    """Return whether the Gmail send scope exists."""
    token = get_oauth_token(
        user_id,
        PROVIDER,
    )

    if token is None:
        return False

    return GMAIL_SEND_SCOPE in set(
        token.get("scopes", [])
    )


def get_gmail_service(
    user_id: str,
):
    """Create an authenticated Gmail API service."""
    if not is_gmail_connected(user_id):
        raise RuntimeError(
            "Gmail is not connected. Reconnect Google "
            "and approve the Gmail send permission."
        )

    credentials = get_credentials(user_id)

    if credentials is None:
        raise RuntimeError(
            "Google credentials are unavailable"
        )

    return build(
        "gmail",
        "v1",
        credentials=credentials,
        cache_discovery=False,
    )


def send_email(
    user_id: str,
    recipient: str,
    subject: str,
    body: str,
    cc: list[str] | None = None,
) -> dict:
    """
    Send an email through the authenticated user's Gmail.

    This function must only be called after explicit user
    confirmation.
    """
    recipient = recipient.strip()
    subject = subject.strip()
    body = body.strip()

    if not is_valid_email(recipient):
        raise ValueError(
            "A valid recipient email address is required"
        )

    if not subject:
        raise ValueError(
            "Email subject cannot be empty"
        )

    if not body:
        raise ValueError(
            "Email body cannot be empty"
        )

    valid_cc = [
        address.strip()
        for address in cc or []
        if is_valid_email(address.strip())
    ]

    message = EmailMessage()
    message["To"] = recipient
    message["Subject"] = subject

    if valid_cc:
        message["Cc"] = ", ".join(valid_cc)

    message.set_content(body)

    encoded_message = base64.urlsafe_b64encode(
        message.as_bytes()
    ).decode("utf-8")

    service = get_gmail_service(user_id)

    sent_message = (
        service.users()
        .messages()
        .send(
            userId="me",
            body={
                "raw": encoded_message,
            },
        )
        .execute()
    )

    return {
        "status": "success",
        "message": (
            f"Email sent to {recipient}"
        ),
        "recipient": recipient,
        "subject": subject,
        "message_id": sent_message.get("id"),
        "thread_id": sent_message.get(
            "threadId"
        ),
        "source": "gmail",
    }


def is_valid_email(
    value: str,
) -> bool:
    """Perform basic recipient email validation."""
    _, address = parseaddr(value)

    if not address or "@" not in address:
        return False

    local_part, domain = address.rsplit(
        "@",
        1,
    )

    return bool(
        local_part
        and domain
        and "." in domain
        and " " not in address
    )