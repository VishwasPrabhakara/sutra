"""Tools used by Sutra's specialized agents."""

from datetime import datetime, timedelta
from typing import Any

import httpx

from calendar_service import (
    create_calendar_event,
    is_calendar_connected,
    list_calendar_events,
    reschedule_calendar_event,
)
from db import (
    create_pending_action,
    get_conn,
)
from gmail_service import is_gmail_connected

HTTP_TIMEOUT = 15.0


# ==================== CALENDAR ====================

def get_calendar_events(
    user_id: str = "vishwas",
    date: str | None = None,
) -> dict:
    """Get Google Calendar events or local fallback events."""
    if is_calendar_connected(user_id):
        try:
            events = list_calendar_events(user_id)

            if date:
                events = [
                    event
                    for event in events
                    if str(
                        event.get("start_time", "")
                    ).startswith(date)
                ]

            return {
                "status": "success",
                "count": len(events),
                "events": events,
                "source": "google",
            }
        except Exception as exc:
            print(
                f"Google Calendar lookup failed: {exc}"
            )

    conn = get_conn()

    if date:
        rows = conn.execute(
            """
            SELECT *
            FROM calendar_events
            WHERE
                user_id = ?
                AND start_time LIKE ?
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


def create_event(
    title: str,
    start_time: str,
    end_time: str | None = None,
    description: str = "",
    location: str = "",
    attendees: list[str] | None = None,
    timezone_name: str = "Asia/Kolkata",
    user_id: str = "vishwas",
) -> dict:
    """Stage a calendar event for explicit user confirmation."""
    payload = {
        "title": title,
        "start_time": start_time,
        "end_time": end_time,
        "description": description,
        "location": location,
        "attendees": attendees or [],
        "timezone_name": timezone_name,
    }
    action_id = create_pending_action(
        user_id=user_id,
        action_type="create_calendar_event",
        payload=payload,
    )
    return {
        "status": "confirmation_required",
        "message": (
            "The calendar event is ready. Review it and confirm "
            "before Sutra creates it."
        ),
        "action_id": action_id,
        "action_type": "create_calendar_event",
        "requires_confirmation": True,
        "event": payload,
    }


def execute_create_event(
    title: str,
    start_time: str,
    end_time: str | None = None,
    description: str = "",
    location: str = "",
    attendees: list[str] | None = None,
    timezone_name: str = "Asia/Kolkata",
    user_id: str = "vishwas",
) -> dict:
    """Create a confirmed event in Google Calendar or local storage."""
    if is_calendar_connected(user_id):
        try:
            return create_calendar_event(
                user_id=user_id,
                title=title,
                start_time=start_time,
                end_time=end_time,
                description=description,
                location=location,
                attendees=attendees,
                timezone_name=timezone_name,
            )
        except Exception as exc:
            return {
                "status": "error",
                "message": (
                    "Google Calendar event creation "
                    f"failed: {exc}"
                ),
                "source": "google",
            }

    start = parse_datetime(start_time)

    if end_time:
        end = parse_datetime(end_time)
    else:
        end = start + timedelta(hours=1)

    if end <= start:
        return {
            "status": "error",
            "message": (
                "Event end time must be after "
                "the start time"
            ),
        }

    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute(
        """
        INSERT INTO calendar_events (
            user_id,
            title,
            start_time,
            end_time,
            created_at
        )
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            user_id,
            title,
            start.isoformat(),
            end.isoformat(),
            datetime.now().isoformat(),
        ),
    )

    event_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {
        "status": "success",
        "message": (
            f"Created local calendar event '{title}'"
        ),
        "event": {
            "id": event_id,
            "user_id": user_id,
            "title": title,
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "description": description,
            "location": location,
            "attendees": attendees or [],
            "source": "local",
        },
        "source": "local",
    }


def reschedule_event(
    event_title: str,
    new_start_time: str,
    user_id: str = "vishwas",
) -> dict:
    """Stage an event reschedule for explicit user confirmation."""
    payload = {
        "event_title": event_title,
        "new_start_time": new_start_time,
    }
    action_id = create_pending_action(
        user_id=user_id,
        action_type="reschedule_calendar_event",
        payload=payload,
    )
    return {
        "status": "confirmation_required",
        "message": (
            "The calendar change is ready. Review it and confirm "
            "before Sutra reschedules the event."
        ),
        "action_id": action_id,
        "action_type": "reschedule_calendar_event",
        "requires_confirmation": True,
        "event": payload,
    }


def execute_reschedule_event(
    event_title: str,
    new_start_time: str,
    user_id: str = "vishwas",
) -> dict:
    """Apply a confirmed Google or local calendar reschedule."""
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
                "message": (
                    "Google Calendar update failed: "
                    f"{exc}"
                ),
                "source": "google",
            }

    conn = get_conn()

    row = conn.execute(
        """
        SELECT *
        FROM calendar_events
        WHERE
            user_id = ?
            AND title LIKE ?
        ORDER BY start_time
        LIMIT 1
        """,
        (
            user_id,
            f"%{event_title}%",
        ),
    ).fetchone()

    if row is None:
        conn.close()

        return {
            "status": "not_found",
            "message": (
                f"No event matching '{event_title}'"
            ),
            "source": "local",
        }

    old_start = parse_datetime(
        row["start_time"]
    )
    old_end = parse_datetime(
        row["end_time"]
    )
    duration = old_end - old_start

    new_start = parse_datetime(
        new_start_time
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
        "message": (
            f"Rescheduled '{row['title']}' "
            f"to {new_start.isoformat()}"
        ),
        "event": {
            "id": row["id"],
            "title": row["title"],
            "start_time": new_start.isoformat(),
            "end_time": new_end.isoformat(),
            "source": "local",
        },
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
            WHERE
                user_id = ?
                AND status = ?
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
    if priority not in {
        "low",
        "medium",
        "high",
    }:
        priority = "medium"

    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute(
        """
        INSERT INTO tasks (
            user_id,
            title,
            status,
            priority,
            created_at
        )
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
        "task": {
            "id": task_id,
            "title": title,
            "priority": priority,
            "status": "pending",
        },
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
        WHERE
            user_id = ?
            AND title LIKE ?
        """,
        (
            user_id,
            f"%{task_title}%",
        ),
    )

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    if affected == 0:
        return {
            "status": "not_found",
            "message": (
                f"No task matching '{task_title}'"
            ),
        }

    return {
        "status": "success",
        "message": (
            f"Completed task: {task_title}"
        ),
        "affected": affected,
    }


# ==================== EMAIL AND SCRIBE ====================

def draft_message(
    recipient: str,
    topic: str,
    context: str = "",
) -> dict:
    """Draft a message without sending it."""
    context_text = (
        f" {context.strip()}"
        if context.strip()
        else ""
    )

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
        "sent": False,
    }


def prepare_email(
    recipient: str,
    subject: str,
    body: str,
    cc: list[str] | None = None,
    user_id: str = "vishwas",
) -> dict:
    """
    Prepare an email and create a confirmation request.

    This tool never sends an email directly.
    """
    if not is_gmail_connected(user_id):
        return {
            "status": "not_connected",
            "message": (
                "Gmail is not connected. Reconnect "
                "Google and approve Gmail sending."
            ),
            "requires_google_connection": True,
        }

    recipient = recipient.strip()
    subject = subject.strip()
    body = body.strip()

    if not recipient or "@" not in recipient:
        return {
            "status": "invalid",
            "message": (
                "A valid recipient email address "
                "is required before sending."
            ),
        }

    if not subject:
        return {
            "status": "invalid",
            "message": (
                "The email subject cannot be empty."
            ),
        }

    if not body:
        return {
            "status": "invalid",
            "message": (
                "The email body cannot be empty."
            ),
        }

    payload = {
        "recipient": recipient,
        "subject": subject,
        "body": body,
        "cc": cc or [],
    }

    action_id = create_pending_action(
        user_id=user_id,
        action_type="send_email",
        payload=payload,
    )

    return {
        "status": "confirmation_required",
        "message": (
            "The email is ready. Review it and "
            "confirm before Sutra sends it."
        ),
        "action_id": action_id,
        "action_type": "send_email",
        "requires_confirmation": True,
        "email": payload,
        "sent": False,
    }


# ==================== WEATHER ====================

def get_weather(
    location: str = "Bengaluru",
    date: str = "tomorrow",
) -> dict:
    """Get weather from Open-Meteo with wttr.in fallback."""
    timeout = httpx.Timeout(
        30.0,
        connect=20.0,
    )

    transport = httpx.HTTPTransport(
        retries=2,
    )

    try:
        with httpx.Client(
            timeout=timeout,
            transport=transport,
        ) as client:
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

            locations = (
                geocoding_response.json()
                .get("results", [])
            )

            if not locations:
                return {
                    "status": "not_found",
                    "message": (
                        f"Could not find location "
                        f"'{location}'"
                    ),
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

        index = forecast_day_index(
            date,
            daily["time"],
        )

        rain_probability = daily[
            "precipitation_probability_max"
        ][index]

        return {
            "status": "success",
            "location": place.get(
                "name",
                location,
            ),
            "country": place.get("country"),
            "date": daily["time"][index],
            "condition": weather_description(
                daily["weather_code"][index]
            ),
            "temperature_max_c": daily[
                "temperature_2m_max"
            ][index],
            "temperature_min_c": daily[
                "temperature_2m_min"
            ][index],
            "rain_probability_percent": (
                rain_probability
            ),
            "advice": weather_advice(
                rain_probability
            ),
            "source": "Open-Meteo",
        }

    except (
        httpx.HTTPError,
        TimeoutError,
    ) as exc:
        print(
            "Open-Meteo failed, using fallback: "
            f"{exc}"
        )

        return get_weather_fallback(
            location,
            date,
        )
    
def get_weather_fallback(
    location: str,
    requested_date: str,
) -> dict:
    """Use wttr.in when Open-Meteo is unavailable."""
    try:
        response = httpx.get(
            f"https://wttr.in/{location}",
            params={"format": "j1"},
            timeout=30.0,
            follow_redirects=True,
        )
        response.raise_for_status()
        data = response.json()

        forecasts = data.get("weather", [])

        if not forecasts:
            raise ValueError(
                "Fallback returned no forecast"
            )

        dates = [
            forecast["date"]
            for forecast in forecasts
        ]

        index = forecast_day_index(
            requested_date,
            dates,
        )

        forecast = forecasts[index]
        hourly = forecast.get("hourly", [])

        rain_probability = max(
            (
                int(hour.get(
                    "chanceofrain",
                    0,
                ))
                for hour in hourly
            ),
            default=0,
        )

        representative = (
            hourly[len(hourly) // 2]
            if hourly
            else {}
        )

        descriptions = representative.get(
            "weatherDesc",
            [],
        )

        condition = (
            descriptions[0].get(
                "value",
                "Unknown",
            ).strip()
            if descriptions
            else "Unknown"
        )

        area = (
            data.get("nearest_area", [{}])[0]
        )

        area_names = area.get(
            "areaName",
            [],
        )

        countries = area.get(
            "country",
            [],
        )

        resolved_location = (
            area_names[0].get("value")
            if area_names
            else location
        )

        country = (
            countries[0].get("value")
            if countries
            else None
        )

        return {
            "status": "success",
            "location": resolved_location,
            "country": country,
            "date": forecast["date"],
            "condition": condition,
            "temperature_max_c": float(
                forecast["maxtempC"]
            ),
            "temperature_min_c": float(
                forecast["mintempC"]
            ),
            "rain_probability_percent": (
                rain_probability
            ),
            "advice": weather_advice(
                rain_probability
            ),
            "source": "wttr.in fallback",
        }

    except Exception as exc:
        return {
            "status": "error",
            "message": (
                "Both weather services failed: "
                f"{exc}"
            ),
        }


def weather_advice(
    rain_probability: int,
) -> str:
    if rain_probability >= 60:
        return (
            "Consider moving outdoor "
            "activities indoors."
        )

    return (
        "Conditions appear suitable "
        "for outdoor plans."
    )


def forecast_day_index(
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
            target = datetime.fromisoformat(
                requested_date
            ).date()
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

            requested_weekday = weekdays.get(
                value
            )

            if requested_weekday is None:
                return min(
                    1,
                    len(available_dates) - 1,
                )

            days_ahead = (
                requested_weekday
                - today.weekday()
            ) % 7

            target = today + timedelta(
                days=days_ahead
            )

    target_text = target.isoformat()

    if target_text in available_dates:
        return available_dates.index(
            target_text
        )

    return min(
        1,
        len(available_dates) - 1,
    )


def weather_description(
    code: int,
) -> str:
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
        99: (
            "Severe thunderstorm with hail"
        ),
    }

    return descriptions.get(
        code,
        f"Weather code {code}",
    )


# ==================== WEB SEARCH ====================

def search_web(
    query: str,
    max_results: int = 5,
) -> dict:
    """Search DuckDuckGo's Instant Answer API."""
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
            results.append({
                "title": (
                    data.get("Heading")
                    or query
                ),
                "summary": data[
                    "AbstractText"
                ],
                "url": data.get(
                    "AbstractURL"
                ),
            })

        for topic in data.get(
            "RelatedTopics",
            [],
        ):
            if len(results) >= max_results:
                break

            candidates = (
                topic.get("Topics", [])
                if "Topics" in topic
                else [topic]
            )

            for candidate in candidates:
                if len(results) >= max_results:
                    break

                if candidate.get("Text"):
                    results.append({
                        "title": candidate[
                            "Text"
                        ].split(" - ")[0],
                        "summary": candidate[
                            "Text"
                        ],
                        "url": candidate.get(
                            "FirstURL"
                        ),
                    })

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
            "message": (
                f"Search service failed: {exc}"
            ),
        }


# ==================== HACKER NEWS ====================

def get_hacker_news(
    limit: int = 5,
) -> dict:
    """Get top stories from Hacker News."""
    limit = max(
        1,
        min(limit, 20),
    )

    try:
        with httpx.Client(
            timeout=HTTP_TIMEOUT
        ) as client:
            response = client.get(
                (
                    "https://hacker-news."
                    "firebaseio.com/v0/"
                    "topstories.json"
                )
            )

            response.raise_for_status()
            story_ids = response.json()[:limit]
            stories = []

            for story_id in story_ids:
                story_response = client.get(
                    (
                        "https://hacker-news."
                        "firebaseio.com/v0/item/"
                        f"{story_id}.json"
                    )
                )

                story_response.raise_for_status()
                story = story_response.json()

                if not story:
                    continue

                stories.append({
                    "id": story["id"],
                    "title": story.get("title"),
                    "url": story.get(
                        "url",
                        (
                            "https://news.ycombinator.com/"
                            f"item?id={story['id']}"
                        ),
                    ),
                    "score": story.get(
                        "score",
                        0,
                    ),
                    "author": story.get("by"),
                    "comments": story.get(
                        "descendants",
                        0,
                    ),
                })

        return {
            "status": "success",
            "count": len(stories),
            "stories": stories,
            "source": "Hacker News",
        }

    except httpx.HTTPError as exc:
        return {
            "status": "error",
            "message": (
                "Hacker News service failed: "
                f"{exc}"
            ),
        }


def parse_datetime(
    value: str,
) -> datetime:
    """Parse an ISO datetime value."""
    return datetime.fromisoformat(
        value.replace("Z", "+00:00")
    )


if __name__ == "__main__":
    from db import init_db

    init_db()

    print("Calendar:", get_calendar_events())
    print("Tasks:", get_tasks())
    print(
        "Weather:",
        get_weather(
            "Bengaluru",
            "tomorrow",
        ),
    )
