"""Google Calendar API wrapper with automatic token refresh."""

from datetime import datetime, timedelta, timezone

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from auth import PROVIDER, SCOPES
from db import get_oauth_token, save_oauth_token


def get_credentials(user_id: str) -> Credentials | None:
    """Load and refresh a user's Google credentials."""
    token = get_oauth_token(user_id, PROVIDER)

    if token is None:
        return None

    credentials = Credentials.from_authorized_user_info(
        token,
        SCOPES,
    )

    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())

        save_oauth_token(
            user_id=user_id,
            provider=PROVIDER,
            token={
                "token": credentials.token,
                "refresh_token": credentials.refresh_token,
                "token_uri": credentials.token_uri,
                "client_id": credentials.client_id,
                "client_secret": credentials.client_secret,
                "scopes": list(credentials.scopes or SCOPES),
                "expiry": (
                    credentials.expiry.isoformat()
                    if credentials.expiry
                    else None
                ),
            },
        )

    return credentials


def is_calendar_connected(user_id: str) -> bool:
    """Return whether a user has stored Google credentials."""
    return get_credentials(user_id) is not None


def get_calendar_service(user_id: str):
    """Create an authenticated Google Calendar API service."""
    credentials = get_credentials(user_id)

    if credentials is None:
        raise RuntimeError("Google Calendar is not connected")

    return build(
        "calendar",
        "v3",
        credentials=credentials,
        cache_discovery=False,
    )


def list_calendar_events(
    user_id: str,
    days: int = 14,
) -> list[dict]:
    """Return upcoming events from the primary Google Calendar."""
    service = get_calendar_service(user_id)

    now = datetime.now(timezone.utc)
    end = now + timedelta(days=days)

    response = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=now.isoformat(),
            timeMax=end.isoformat(),
            singleEvents=True,
            orderBy="startTime",
            maxResults=50,
        )
        .execute()
    )

    events = []

    for event in response.get("items", []):
        start = event.get("start", {})
        finish = event.get("end", {})

        events.append(
            {
                "id": event["id"],
                "user_id": user_id,
                "title": event.get("summary", "(untitled)"),
                "start_time": (
                    start.get("dateTime")
                    or start.get("date")
                ),
                "end_time": (
                    finish.get("dateTime")
                    or finish.get("date")
                ),
                "created_at": event.get("created", ""),
                "source": "google",
            }
        )

    return events


def find_calendar_event(
    user_id: str,
    event_title: str,
) -> dict | None:
    """Find the first upcoming event matching a title."""
    service = get_calendar_service(user_id)

    response = (
        service.events()
        .list(
            calendarId="primary",
            q=event_title,
            timeMin=datetime.now(timezone.utc).isoformat(),
            singleEvents=True,
            orderBy="startTime",
            maxResults=10,
        )
        .execute()
    )

    events = response.get("items", [])
    return events[0] if events else None


def reschedule_calendar_event(
    user_id: str,
    event_title: str,
    new_start_time: str,
) -> dict:
    """
    Reschedule the first matching timed event.

    new_start_time must be ISO 8601, for example:
    2026-06-12T14:00:00+05:30
    """
    service = get_calendar_service(user_id)
    event = find_calendar_event(user_id, event_title)

    if event is None:
        return {
            "status": "not_found",
            "message": f"No event matching '{event_title}'",
        }

    old_start = event.get("start", {}).get("dateTime")
    old_end = event.get("end", {}).get("dateTime")

    if not old_start or not old_end:
        return {
            "status": "unsupported",
            "message": "All-day events cannot be rescheduled yet",
        }

    new_start = datetime.fromisoformat(
        new_start_time.replace("Z", "+00:00")
    )
    old_start_datetime = datetime.fromisoformat(old_start)
    old_end_datetime = datetime.fromisoformat(old_end)
    duration = old_end_datetime - old_start_datetime
    new_end = new_start + duration

    event["start"]["dateTime"] = new_start.isoformat()
    event["end"]["dateTime"] = new_end.isoformat()

    updated_event = (
        service.events()
        .update(
            calendarId="primary",
            eventId=event["id"],
            body=event,
        )
        .execute()
    )

    return {
        "status": "success",
        "message": (
            f"Rescheduled "
            f"'{updated_event.get('summary', event_title)}' "
            f"to {new_start.isoformat()}"
        ),
        "event_id": updated_event["id"],
        "source": "google",
    }