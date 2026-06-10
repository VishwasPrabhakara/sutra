"""Tools used by Sutra's specialized agents."""

from datetime import datetime, timedelta
from typing import Any

import httpx

from calendar_service import (
    is_calendar_connected,
    list_calendar_events,
    reschedule_calendar_event,
)
from db import get_conn

HTTP_TIMEOUT = 15.0


# ==================== CALENDAR ====================

def get_calendar_events(
    user_id: str = "vishwas",
    date: str | None = None,
) -> dict:
    """Get events from Google Calendar or the local fallback calendar."""
    if is_calendar_connected(user_id):
        try:
            events = list_calendar_events(user_id)

            if date:
                events = [
                    event
                    for event in events
                    if str(event["start_time"]).startswith(date)
                ]

            return {
                "status": "success",
                "count": len(events),
                "events": events,
                "source": "google",
            }
        except Exception as exc:
            print(f"Google Calendar lookup failed: {exc}")

    conn = get_conn()

    if date:
        rows = conn.execute(
            """
            SELECT *
            FROM calendar_events
            WHERE user_id = ? AND start_time LIKE ?
            ORDER BY start_time
            """,
            (user_id, f"{date}%"),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT *
            FROM calendar_events
            WHERE user_id = ?
            ORDER BY start_time
            """,
            (user_id,),
        ).fetchall()

    conn.close()

    events = [
        {
            **dict(row),
            "source": "local",
        }
        for row in rows
    ]

    return {
        "status": "success",
        "count": len(events),
        "events": events,
        "source": "local",
    }


def reschedule_event(
    event_title: str,
    new_start_time: str,
    user_id: str = "vishwas",
) -> dict:
    """Reschedule an event using Google Calendar or local storage."""
    if is_calendar_connected(user_id):
        try:
            return reschedule_calendar_event(
                user_id=user_id,
                event_title=event_title,
                new_start_time=new_start_time,
            )
        except Exception as exc:
            return {
                "status": "error",
                "message": f"Google Calendar update failed: {exc}",
                "source": "google",
            }

    conn = get_conn()

    row = conn.execute(
        """
        SELECT *
        FROM calendar_events
        WHERE user_id = ? AND title LIKE ?
        ORDER BY start_time
        LIMIT 1
        """,
        (user_id, f"%{event_title}%"),
    ).fetchone()

    if row is None:
        conn.close()
        return {
            "status": "not_found",
            "message": f"No event matching '{event_title}'",
            "source": "local",
        }

    old_start = datetime.fromisoformat(row["start_time"])
    old_end = datetime.fromisoformat(row["end_time"])
    duration = old_end - old_start

    new_start = datetime.fromisoformat(
        new_start_time.replace("Z", "+00:00")
    )
    new_end = new_start + duration

    conn.execute(
        """
        UPDATE calendar_events
        SET start_time = ?, end_time = ?
        WHERE id = ?
        """,
        (
            new_start.isoformat(),
            new_end.isoformat(),
            row["id"],
        ),
    )

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "message": f"Rescheduled '{row['title']}' to {new_start.isoformat()}",
        "event_id": row["id"],
        "source": "local",
    }


# ==================== TASKS ====================

def get_tasks(
    user_id: str = "vishwas",
    status: str | None = None,
) -> dict:
    conn = get_conn()

    if status:
        rows = conn.execute(
            """
            SELECT *
            FROM tasks
            WHERE user_id = ? AND status = ?
            ORDER BY created_at DESC
            """,
            (user_id, status),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT *
            FROM tasks
            WHERE user_id = ?
            ORDER BY created_at DESC
            """,
            (user_id,),
        ).fetchall()

    conn.close()
    tasks = [dict(row) for row in rows]

    return {
        "status": "success",
        "count": len(tasks),
        "tasks": tasks,
    }


def create_task(
    title: str,
    priority: str = "medium",
    user_id: str = "vishwas",
) -> dict:
    if priority not in {"low", "medium", "high"}:
        priority = "medium"

    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute(
        """
        INSERT INTO tasks
            (user_id, title, status, priority, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            user_id,
            title,
            "pending",
            priority,
            datetime.now().isoformat(),
        ),
    )

    task_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {
        "status": "success",
        "message": f"Created task: {title}",
        "task_id": task_id,
    }


def complete_task(
    task_title: str,
    user_id: str = "vishwas",
) -> dict:
    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute(
        """
        UPDATE tasks
        SET status = 'completed'
        WHERE user_id = ? AND title LIKE ?
        """,
        (user_id, f"%{task_title}%"),
    )

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    if affected == 0:
        return {
            "status": "not_found",
            "message": f"No task matching '{task_title}'",
        }

    return {
        "status": "success",
        "message": f"Completed: {task_title}",
        "affected": affected,
    }


# ==================== SCRIBE ====================

def draft_message(
    recipient: str,
    topic: str,
    context: str = "",
) -> dict:
    context_text = f" {context.strip()}" if context.strip() else ""

    draft = (
        f"Hi {recipient},\n\n"
        f"Quick note about {topic}.{context_text}\n\n"
        "Let me know what works for you.\n\n"
        "Thanks,\n"
        "Vishwas"
    )

    return {
        "status": "success",
        "recipient": recipient,
        "topic": topic,
        "draft": draft,
    }


# ==================== WEATHER ====================

def get_weather(
    location: str = "Bengaluru",
    date: str = "tomorrow",
) -> dict:
    """Get a real forecast using the free Open-Meteo APIs."""
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            geocoding_response = client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={
                    "name": location,
                    "count": 1,
                    "language": "en",
                    "format": "json",
                },
            )
            geocoding_response.raise_for_status()
            locations = geocoding_response.json().get("results", [])

            if not locations:
                return {
                    "status": "not_found",
                    "message": f"Could not find location '{location}'",
                }

            place = locations[0]

            forecast_response = client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": place["latitude"],
                    "longitude": place["longitude"],
                    "daily": (
                        "weather_code,"
                        "temperature_2m_max,"
                        "temperature_2m_min,"
                        "precipitation_probability_max"
                    ),
                    "timezone": "auto",
                    "forecast_days": 7,
                },
            )
            forecast_response.raise_for_status()
            daily = forecast_response.json()["daily"]

        index = _forecast_day_index(date, daily["time"])
        weather_code = daily["weather_code"][index]
        rain_probability = daily["precipitation_probability_max"][index]

        return {
            "status": "success",
            "location": place.get("name", location),
            "country": place.get("country"),
            "date": daily["time"][index],
            "condition": _weather_description(weather_code),
            "temperature_max_c": daily["temperature_2m_max"][index],
            "temperature_min_c": daily["temperature_2m_min"][index],
            "rain_probability_percent": rain_probability,
            "advice": (
                "Consider moving outdoor activities indoors."
                if rain_probability >= 60
                else "Conditions appear suitable for outdoor plans."
            ),
            "source": "Open-Meteo",
        }
    except httpx.HTTPError as exc:
        return {
            "status": "error",
            "message": f"Weather service failed: {exc}",
        }


def _forecast_day_index(
    requested_date: str,
    available_dates: list[str],
) -> int:
    value = requested_date.strip().lower()
    today = datetime.now().date()

    if value == "today":
        target = today
    elif value == "tomorrow":
        target = today + timedelta(days=1)
    else:
        try:
            target = datetime.fromisoformat(requested_date).date()
        except ValueError:
            weekdays = {
                "monday": 0,
                "tuesday": 1,
                "wednesday": 2,
                "thursday": 3,
                "friday": 4,
                "saturday": 5,
                "sunday": 6,
            }

            requested_weekday = weekdays.get(value)

            if requested_weekday is None:
                return min(1, len(available_dates) - 1)

            days_ahead = (requested_weekday - today.weekday()) % 7
            target = today + timedelta(days=days_ahead)

    target_text = target.isoformat()

    if target_text in available_dates:
        return available_dates.index(target_text)

    return min(1, len(available_dates) - 1)


def _weather_description(code: int) -> str:
    descriptions = {
        0: "Clear sky",
        1: "Mostly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Freezing fog",
        51: "Light drizzle",
        53: "Drizzle",
        55: "Heavy drizzle",
        61: "Light rain",
        63: "Rain",
        65: "Heavy rain",
        71: "Light snow",
        73: "Snow",
        75: "Heavy snow",
        80: "Light rain showers",
        81: "Rain showers",
        82: "Heavy rain showers",
        95: "Thunderstorm",
        96: "Thunderstorm with hail",
        99: "Severe thunderstorm with hail",
    }

    return descriptions.get(code, f"Weather code {code}")


# ==================== WEB SEARCH ====================

def search_web(
    query: str,
    max_results: int = 5,
) -> dict:
    """Search DuckDuckGo's public Instant Answer API."""
    try:
        response = httpx.get(
            "https://api.duckduckgo.com/",
            params={
                "q": query,
                "format": "json",
                "no_html": 1,
                "skip_disambig": 1,
            },
            timeout=HTTP_TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()

        results: list[dict[str, Any]] = []

        if data.get("AbstractText"):
            results.append(
                {
                    "title": data.get("Heading") or query,
                    "summary": data["AbstractText"],
                    "url": data.get("AbstractURL"),
                }
            )

        for topic in data.get("RelatedTopics", []):
            if len(results) >= max_results:
                break

            if "Topics" in topic:
                candidates = topic["Topics"]
            else:
                candidates = [topic]

            for candidate in candidates:
                if len(results) >= max_results:
                    break

                if candidate.get("Text"):
                    results.append(
                        {
                            "title": candidate["Text"].split(" - ")[0],
                            "summary": candidate["Text"],
                            "url": candidate.get("FirstURL"),
                        }
                    )

        return {
            "status": "success",
            "query": query,
            "count": len(results),
            "results": results,
            "source": "DuckDuckGo",
        }
    except httpx.HTTPError as exc:
        return {
            "status": "error",
            "message": f"Search service failed: {exc}",
        }


# ==================== HACKER NEWS ====================

def get_hacker_news(limit: int = 5) -> dict:
    """Get current top stories from the official Hacker News API."""
    limit = max(1, min(limit, 20))

    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            response = client.get(
                "https://hacker-news.firebaseio.com/v0/topstories.json"
            )
            response.raise_for_status()
            story_ids = response.json()[:limit]

            stories = []

            for story_id in story_ids:
                story_response = client.get(
                    "https://hacker-news.firebaseio.com/"
                    f"v0/item/{story_id}.json"
                )
                story_response.raise_for_status()
                story = story_response.json()

                if not story:
                    continue

                stories.append(
                    {
                        "id": story["id"],
                        "title": story.get("title"),
                        "url": story.get(
                            "url",
                            f"https://news.ycombinator.com/item?id={story['id']}",
                        ),
                        "score": story.get("score", 0),
                        "author": story.get("by"),
                        "comments": story.get("descendants", 0),
                    }
                )

        return {
            "status": "success",
            "count": len(stories),
            "stories": stories,
            "source": "Hacker News",
        }
    except httpx.HTTPError as exc:
        return {
            "status": "error",
            "message": f"Hacker News service failed: {exc}",
        }


# ==================== ROUTINE ====================

def set_focus_mode(
    active: bool = True,
    duration_minutes: int = 120,
    reason: str = "deep work",
) -> dict:
    """Represent a focus-mode action for the current session."""
    duration_minutes = max(1, min(duration_minutes, 480))
    end_time = datetime.now() + timedelta(minutes=duration_minutes)

    return {
        "status": "success",
        "focus_mode": "activated" if active else "deactivated",
        "reason": reason,
        "duration_minutes": duration_minutes if active else 0,
        "until": end_time.isoformat() if active else None,
        "message": (
            f"Focus mode activated for {duration_minutes} minutes."
            if active
            else "Focus mode deactivated."
        ),
    }


# ==================== SCREEN SCAN DEMO ====================

def scan_screen(source: str = "whatsapp") -> dict:
    """
    Return demo message-scan data.

    Real WhatsApp, Slack, and email access requires separate provider
    integrations and user authorization.
    """
    mock_results = {
        "whatsapp": {
            "text": (
                "Hey, meeting postponed to tomorrow at 2 PM "
                "instead of 10 AM."
            ),
            "sender": "Marcus",
            "detected_intent": "reschedule",
            "suggested_action": (
                "Update Sprint Demo to tomorrow at 2 PM."
            ),
        },
        "slack": {
            "text": (
                "Team standup moved to 11:30 AM tomorrow. "
                "Please update your calendar."
            ),
            "sender": "#eng-team",
            "detected_intent": "reschedule",
            "suggested_action": (
                "Update Team Standup to tomorrow at 11:30 AM."
            ),
        },
        "email": {
            "text": "Q4 review meeting confirmed for Friday at 3 PM.",
            "sender": "priya.krishnan@company.com",
            "detected_intent": "new_event",
            "suggested_action": (
                "Add Q4 Review to the calendar for Friday at 3 PM."
            ),
        },
    }

    normalized_source = source.lower()
    result = mock_results.get(
        normalized_source,
        mock_results["whatsapp"],
    )

    return {
        "status": "success",
        "source": normalized_source,
        "integration_mode": "demo",
        **result,
        "timestamp": datetime.now().isoformat(),
    }


if __name__ == "__main__":
    from db import init_db

    init_db()

    print("Calendar:", get_calendar_events())
    print("Tasks:", get_tasks())
    print("Weather:", get_weather("Bengaluru", "tomorrow"))
    print("Search:", search_web("Google Gemini"))
    print("Hacker News:", get_hacker_news(3))