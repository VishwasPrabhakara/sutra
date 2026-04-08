"""
Sutra's tools — these simulate MCP servers for calendar, tasks, notes,
weather, routines (DND), and screen scanning.
"""
from datetime import datetime
from db import get_conn


# ============ CALENDAR TOOL ============

def get_calendar_events(user_id: str = "vishwas", date: str = None) -> dict:
    conn = get_conn()
    if date:
        rows = conn.execute(
            "SELECT * FROM calendar_events WHERE user_id = ? AND start_time LIKE ?",
            (user_id, f"{date}%"),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM calendar_events WHERE user_id = ? ORDER BY start_time",
            (user_id,),
        ).fetchall()
    conn.close()
    events = [dict(r) for r in rows]
    return {"status": "success", "count": len(events), "events": events}


def reschedule_event(event_title: str, new_start_time: str, user_id: str = "vishwas") -> dict:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "UPDATE calendar_events SET start_time = ? WHERE user_id = ? AND title LIKE ?",
        (new_start_time, user_id, f"%{event_title}%"),
    )
    affected = cur.rowcount
    conn.commit()
    conn.close()
    if affected == 0:
        return {"status": "not_found", "message": f"No event matching '{event_title}'"}
    return {
        "status": "success",
        "message": f"Rescheduled '{event_title}' to {new_start_time}",
        "affected": affected,
    }


# ============ TASKS TOOL ============

def get_tasks(user_id: str = "vishwas", status: str = None) -> dict:
    conn = get_conn()
    if status:
        rows = conn.execute(
            "SELECT * FROM tasks WHERE user_id = ? AND status = ?",
            (user_id, status),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM tasks WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    conn.close()
    tasks = [dict(r) for r in rows]
    return {"status": "success", "count": len(tasks), "tasks": tasks}


def create_task(title: str, priority: str = "medium", user_id: str = "vishwas") -> dict:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO tasks (user_id, title, status, priority, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, title, "pending", priority, datetime.now().isoformat()),
    )
    task_id = cur.lastrowid
    conn.commit()
    conn.close()
    return {
        "status": "success",
        "message": f"Created task: {title}",
        "task_id": task_id,
    }


def complete_task(task_title: str, user_id: str = "vishwas") -> dict:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "UPDATE tasks SET status = 'completed' WHERE user_id = ? AND title LIKE ?",
        (user_id, f"%{task_title}%"),
    )
    affected = cur.rowcount
    conn.commit()
    conn.close()
    if affected == 0:
        return {"status": "not_found"}
    return {"status": "success", "message": f"Completed: {task_title}"}


# ============ NOTES / DRAFT TOOL ============

def draft_message(recipient: str, topic: str, context: str = "") -> dict:
    draft = (
        f"Hi {recipient},\n\n"
        f"Quick note about {topic}. {context}\n\n"
        f"Let me know what works.\n\nThanks,\nVishwas"
    )
    return {
        "status": "success",
        "recipient": recipient,
        "draft": draft,
    }


# ============ WEATHER TOOL (NEW) ============

def get_weather(location: str = "Bengaluru", date: str = "tomorrow") -> dict:
    """Simulated weather lookup. In prod, this would hit openweathermap."""
    # Deterministic mock — Bengaluru weather varies by "date" keyword
    rainy_keywords = ["rain", "monsoon", "wet"]
    is_rainy = (
        any(k in location.lower() for k in rainy_keywords)
        or "tomorrow" in date.lower()
    )
    return {
        "status": "success",
        "location": location,
        "date": date,
        "condition": "Heavy rain expected" if is_rainy else "Clear and sunny",
        "temperature_c": 22 if is_rainy else 29,
        "advice": "Reschedule outdoor activities" if is_rainy else "Good for outdoor plans",
    }


# ============ ROUTINE / DND TOOL (NEW) ============

def set_focus_mode(active: bool = True, duration_minutes: int = 120, reason: str = "deep work") -> dict:
    """Activate Do Not Disturb / Focus Mode for deep work sessions."""
    end_time = datetime.now()
    if active:
        from datetime import timedelta
        end_time = end_time + timedelta(minutes=duration_minutes)
    return {
        "status": "success",
        "focus_mode": "ACTIVATED" if active else "DEACTIVATED",
        "reason": reason,
        "duration_minutes": duration_minutes,
        "until": end_time.strftime("%H:%M") if active else None,
        "message": (
            f"Focus mode on for {duration_minutes} min — notifications silenced, calendar blocked."
            if active
            else "Focus mode deactivated."
        ),
    }


# ============ SCREEN SCAN TOOL (NEW) ============

def scan_screen(source: str = "whatsapp") -> dict:
    """
    Simulated screen/message scan. In prod, this would use OCR or
    integrate with WhatsApp Web / Slack / email.
    Returns a synthetic message that triggers a cascade to the Scheduler.
    """
    # Deterministic mock — always returns a "schedule change" message
    mock_results = {
        "whatsapp": {
            "text": "Hey, meeting postponed to tomorrow at 2 PM instead of 10 AM",
            "sender": "Marcus (Team Lead)",
            "detected_intent": "reschedule",
            "suggested_action": "Update Sprint Demo to tomorrow 2:00 PM",
        },
        "slack": {
            "text": "Team standup moved to 11:30 AM tomorrow — please update your calendars",
            "sender": "#eng-team",
            "detected_intent": "reschedule",
            "suggested_action": "Update Team Standup to tomorrow 11:30 AM",
        },
        "email": {
            "text": "Q4 review meeting confirmed for Friday 3 PM",
            "sender": "priya.krishnan@company.com",
            "detected_intent": "new_event",
            "suggested_action": "Add Q4 Review to calendar Friday 3:00 PM",
        },
    }
    result = mock_results.get(source.lower(), mock_results["whatsapp"])
    return {
        "status": "success",
        "source": source,
        **result,
        "timestamp": datetime.now().isoformat(),
    }


# Quick test
if __name__ == "__main__":
    from db import init_db
    init_db()
    print("Calendar:", get_calendar_events())
    print("Tasks:", get_tasks())
    print("Draft:", draft_message("Marcus", "Q4 deck"))
    print("Weather:", get_weather("Bengaluru", "tomorrow"))
    print("Focus:", set_focus_mode(True, 120, "coding"))
    print("Scan:", scan_screen("whatsapp"))