"""Google OAuth helpers for Calendar and Gmail access."""

import os
import secrets
import time
from pathlib import Path
from urllib.parse import urlencode

from dotenv import load_dotenv
from google_auth_oauthlib.flow import Flow

from db import (
    delete_oauth_token,
    get_oauth_token,
    save_oauth_token,
)

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH)

PROVIDER = "google_workspace"

CALENDAR_SCOPE = (
    "https://www.googleapis.com/auth/calendar"
)

GMAIL_SEND_SCOPE = (
    "https://www.googleapis.com/auth/gmail.send"
)

SCOPES = [
    CALENDAR_SCOPE,
    GMAIL_SEND_SCOPE,
]

STATE_TTL_SECONDS = 600

# Suitable for a local or single-instance demo.
# Production deployments should store OAuth states in Redis,
# Firestore, or another shared database.
_oauth_states: dict[str, dict] = {}


def oauth_configured() -> bool:
    """Return whether all required OAuth settings exist."""
    return bool(
        os.getenv("GOOGLE_CLIENT_ID")
        and os.getenv("GOOGLE_CLIENT_SECRET")
        and os.getenv("GOOGLE_REDIRECT_URI")
    )


def get_client_config() -> dict:
    """Build the Google OAuth client configuration."""
    if not oauth_configured():
        raise RuntimeError(
            "Google OAuth is not configured. Set "
            "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, "
            "and GOOGLE_REDIRECT_URI."
        )

    return {
        "web": {
            "client_id": os.environ[
                "GOOGLE_CLIENT_ID"
            ],
            "client_secret": os.environ[
                "GOOGLE_CLIENT_SECRET"
            ],
            "auth_uri": (
                "https://accounts.google.com/o/oauth2/auth"
            ),
            "token_uri": (
                "https://oauth2.googleapis.com/token"
            ),
            "redirect_uris": [
                os.environ["GOOGLE_REDIRECT_URI"]
            ],
        }
    }


def create_flow(
    state: str | None = None,
) -> Flow:
    """Create an OAuth flow for Calendar and Gmail."""
    flow = Flow.from_client_config(
        get_client_config(),
        scopes=SCOPES,
        state=state,
    )

    flow.redirect_uri = os.environ[
        "GOOGLE_REDIRECT_URI"
    ]

    return flow


def create_authorization_url(
    user_id: str,
) -> str:
    """Create the Google authorization URL."""
    state = secrets.token_urlsafe(32)

    _remove_expired_states()

    _oauth_states[state] = {
        "user_id": user_id,
        "created_at": time.time(),
    }

    flow = create_flow(state=state)

    authorization_url, returned_state = (
        flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
        )
    )

    if returned_state != state:
        raise RuntimeError(
            "OAuth state generation failed"
        )

    return authorization_url


def exchange_authorization_code(
    code: str,
    state: str,
) -> str:
    """
    Exchange Google's authorization code for credentials.

    Returns the Sutra user ID associated with the request.
    """
    state_data = _oauth_states.pop(state, None)

    if state_data is None:
        raise ValueError(
            "Invalid or expired OAuth state"
        )

    age = time.time() - state_data["created_at"]

    if age > STATE_TTL_SECONDS:
        raise ValueError("OAuth state has expired")

    user_id = state_data["user_id"]
    flow = create_flow(state=state)

    flow.fetch_token(code=code)

    credentials = flow.credentials
    granted_scopes = list(
        credentials.scopes or SCOPES
    )

    save_oauth_token(
        user_id=user_id,
        provider=PROVIDER,
        token={
            "token": credentials.token,
            "refresh_token": (
                credentials.refresh_token
            ),
            "token_uri": credentials.token_uri,
            "client_id": credentials.client_id,
            "client_secret": (
                credentials.client_secret
            ),
            "scopes": granted_scopes,
            "expiry": (
                credentials.expiry.isoformat()
                if credentials.expiry
                else None
            ),
        },
    )

    return user_id


def get_connection_status(
    user_id: str,
) -> dict:
    """Return Calendar and Gmail connection status."""
    token = get_oauth_token(
        user_id,
        PROVIDER,
    )

    granted_scopes = set(
        token.get("scopes", [])
        if token
        else []
    )

    calendar_connected = (
        token is not None
        and CALENDAR_SCOPE in granted_scopes
    )

    gmail_connected = (
        token is not None
        and GMAIL_SEND_SCOPE in granted_scopes
    )

    return {
        "provider": PROVIDER,
        "configured": oauth_configured(),
        "connected": calendar_connected,
        "calendar_connected": calendar_connected,
        "gmail_connected": gmail_connected,
        "requires_reconnect": (
            token is not None
            and not gmail_connected
        ),
        "scopes": sorted(granted_scopes),
    }


def disconnect_calendar(
    user_id: str,
) -> None:
    """
    Remove Google credentials.

    Calendar and Gmail share one OAuth grant, so disconnecting
    removes access to both services.
    """
    delete_oauth_token(
        user_id,
        PROVIDER,
    )


def get_frontend_redirect(
    status: str,
) -> str:
    """Build the frontend redirect after OAuth."""
    frontend_url = os.getenv(
        "FRONTEND_URL",
        "http://localhost:5173",
    )

    query = urlencode({
        "google": status,
    })

    return f"{frontend_url}?{query}"


def has_scope(
    user_id: str,
    required_scope: str,
) -> bool:
    """Check whether the stored grant contains a scope."""
    token = get_oauth_token(
        user_id,
        PROVIDER,
    )

    if token is None:
        return False

    return required_scope in set(
        token.get("scopes", [])
    )


def _remove_expired_states() -> None:
    """Remove expired in-memory OAuth states."""
    now = time.time()

    expired_states = [
        state
        for state, data in _oauth_states.items()
        if now - data["created_at"]
        > STATE_TTL_SECONDS
    ]

    for state in expired_states:
        _oauth_states.pop(state, None)