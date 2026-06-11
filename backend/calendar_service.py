"""Google Calendar API integration."""

from datetime import datetime, timedelta, timezone
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from auth import (
    CALENDAR_SCOPE,
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
    """Load and refresh a user's Google credentials."""
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

        save_credentials(
            user_id,
            credentials,
        )

    return credentials


def save_credentials(
    user_id: str,
    credentials: Credentials,
) -> None:
    """Persist refreshed Google credentials."""
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


def is_calendar_connected(
    user_id: str,
) -> bool:
    """Return whether Calendar access is available."""
    token = get_oauth_token(
        user_id,
        PROVIDER,
    )

    if token is None:
        return False

    return CALENDAR_SCOPE in set(
        token.get("scopes", [])
    )


def get_calendar_service(
    user_id: str,
):
    """Create an authenticated Calendar API service."""
    if not is_calendar_connected(user_id):
        raise RuntimeError(
            "Google Calendar is not connected"
        )

    credentials = get_credentials(user_id)

    if credentials is None:
        raise RuntimeError(
            "Google credentials are unavailable"
        )

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
    """Return upcoming primary-calendar events."""
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

    return [
        normalize_calendar_event(
            event,
            user_id,
        )
        for event in response.get("items", [])
    ]


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
            timeMin=(
                datetime.now(timezone.utc).isoformat()
            ),
            singleEvents=True,
            orderBy="startTime",
            maxResults=10,
        )
        .execute()
    )

    events = response.get("items", [])
    return events[0] if events else None


def create_calendar_event(
    user_id: str,
    title: str,
    start_time: str,
    end_time: str | None = None,
    description: str = "",
    location: str = "",
    timezone_name: str = "Asia/Kolkata",
    attendees: list[str] | None = None,
) -> dict:
    """
    Create an event on the primary Google Calendar.

    Times must be ISO 8601 values, for example:
    2026-06-15T14:00:00+05:30
    """
    service = get_calendar_service(user_id)

    start = parse_iso_datetime(start_time)

    if end_time:
        end = parse_iso_datetime(end_time)
    else:
        end = start + timedelta(hours=1)

    if end <= start:
        raise ValueError(
            "Event end time must be after start time"
        )

    event_body: dict[str, Any] = {
        "summary": title,
        "start": {
            "dateTime": start.isoformat(),
            "timeZone": timezone_name,
        },
        "end": {
            "dateTime": end.isoformat(),
            "timeZone": timezone_name,
        },
    }

    if description.strip():
        event_body["description"] = (
            description.strip()
        )

    if location.strip():
        event_body["location"] = location.strip()

    valid_attendees = [
        email.strip()
        for email in attendees or []
        if email.strip()
    ]

    if valid_attendees:
        event_body["attendees"] = [
            {"email": email}
            for email in valid_attendees
        ]

    created = (
        service.events()
        .insert(
            calendarId="primary",
            body=event_body,
            sendUpdates=(
                "all"
                if valid_attendees
                else "none"
            ),
        )
        .execute()
    )

    return {
        "status": "success",
        "message": (
            f"Created calendar event '{title}'"
        ),
        "event": normalize_calendar_event(
            created,
            user_id,
        ),
        "event_url": created.get("htmlLink"),
        "source": "google",
    }


def reschedule_calendar_event(
    user_id: str,
    event_title: str,
    new_start_time: str,
) -> dict:
    """Reschedule the first matching timed event."""
    service = get_calendar_service(user_id)

    event = find_calendar_event(
        user_id,
        event_title,
    )

    if event is None:
        return {
            "status": "not_found",
            "message": (
                f"No event matching '{event_title}'"
            ),
        }

    old_start = (
        event.get("start", {}).get("dateTime")
    )

    old_end = (
        event.get("end", {}).get("dateTime")
    )

    if not old_start or not old_end:
        return {
            "status": "unsupported",
            "message": (
                "All-day events cannot be "
                "rescheduled yet"
            ),
        }

    new_start = parse_iso_datetime(
        new_start_time
    )

    old_start_datetime = parse_iso_datetime(
        old_start
    )

    old_end_datetime = parse_iso_datetime(
        old_end
    )

    duration = (
        old_end_datetime
        - old_start_datetime
    )

    new_end = new_start + duration

    event["start"]["dateTime"] = (
        new_start.isoformat()
    )

    event["end"]["dateTime"] = (
        new_end.isoformat()
    )

    updated_event = (
        service.events()
        .update(
            calendarId="primary",
            eventId=event["id"],
            body=event,
            sendUpdates="all",
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
        "event": normalize_calendar_event(
            updated_event,
            user_id,
        ),
        "event_url": updated_event.get(
            "htmlLink"
        ),
        "source": "google",
    }


def normalize_calendar_event(
    event: dict,
    user_id: str,
) -> dict:
    """Convert a Google event to Sutra's format."""
    start = event.get("start", {})
    end = event.get("end", {})

    return {
        "id": event.get("id"),
        "user_id": user_id,
        "title": event.get(
            "summary",
            "(untitled)",
        ),
        "start_time": (
            start.get("dateTime")
            or start.get("date")
        ),
        "end_time": (
            end.get("dateTime")
            or end.get("date")
        ),
        "description": event.get(
            "description",
            "",
        ),
        "location": event.get(
            "location",
            "",
        ),
        "created_at": event.get(
            "created",
            "",
        ),
        "event_url": event.get("htmlLink"),
        "source": "google",
    }


def parse_iso_datetime(
    value: str,
) -> datetime:
    """Parse an ISO datetime and require a timezone."""
    parsed = datetime.fromisoformat(
        value.replace("Z", "+00:00")
    )

    if parsed.tzinfo is None:
        raise ValueError(
            "Datetime must include a timezone offset, "
            "for example +05:30"
        )

    return parsed