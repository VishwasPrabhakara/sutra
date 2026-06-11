"""SQLite persistence for Sutra."""

import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parent / "sutra.db"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create all database tables and seed local demo data."""
    conn = get_conn()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS request_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            request_text TEXT NOT NULL,
            request_type TEXT,
            created_at TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            priority TEXT DEFAULT 'medium',
            created_at TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS calendar_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS oauth_tokens (
            user_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            token_json TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (user_id, provider)
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS conversation_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK (
                role IN ('user', 'assistant')
            ),
            content TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS pending_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            action_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            completed_at TEXT
        )
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS
            idx_conversation_user_created
        ON conversation_messages (
            user_id,
            created_at DESC
        )
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS
            idx_pending_actions_user_status
        ON pending_actions (
            user_id,
            status
        )
        """
    )

    cur.execute(
        "SELECT COUNT(*) FROM calendar_events"
    )

    if cur.fetchone()[0] == 0:
        seed_demo_data(cur)

    conn.commit()
    conn.close()


def seed_demo_data(cur: sqlite3.Cursor) -> None:
    """Add fallback data for users without Google Calendar."""
    now = datetime.now()
    tomorrow = now + timedelta(days=1)
    day_after = now + timedelta(days=2)

    events = [
        (
            "vishwas",
            "Sprint Demo",
            tomorrow.replace(
                hour=14,
                minute=0,
                second=0,
                microsecond=0,
            ).isoformat(),
            tomorrow.replace(
                hour=15,
                minute=0,
                second=0,
                microsecond=0,
            ).isoformat(),
            now.isoformat(),
        ),
        (
            "vishwas",
            "1:1 with Marcus",
            tomorrow.replace(
                hour=11,
                minute=0,
                second=0,
                microsecond=0,
            ).isoformat(),
            tomorrow.replace(
                hour=11,
                minute=30,
                second=0,
                microsecond=0,
            ).isoformat(),
            now.isoformat(),
        ),
        (
            "vishwas",
            "Design Review",
            day_after.replace(
                hour=10,
                minute=0,
                second=0,
                microsecond=0,
            ).isoformat(),
            day_after.replace(
                hour=11,
                minute=0,
                second=0,
                microsecond=0,
            ).isoformat(),
            now.isoformat(),
        ),
    ]

    cur.executemany(
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
        events,
    )

    tasks = [
        (
            "vishwas",
            "Send Q4 deck to Marcus",
            "pending",
            "high",
            now.isoformat(),
        ),
        (
            "vishwas",
            "Review PR #234",
            "pending",
            "medium",
            now.isoformat(),
        ),
        (
            "vishwas",
            "Book flight to Chennai",
            "pending",
            "low",
            now.isoformat(),
        ),
    ]

    cur.executemany(
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
        tasks,
    )


def log_request(
    user_id: str,
    request_text: str,
    request_type: str,
) -> None:
    conn = get_conn()

    conn.execute(
        """
        INSERT INTO request_history (
            user_id,
            request_text,
            request_type,
            created_at
        )
        VALUES (?, ?, ?, ?)
        """,
        (
            user_id,
            request_text,
            request_type,
            datetime.now().isoformat(),
        ),
    )

    conn.commit()
    conn.close()


def save_conversation_message(
    user_id: str,
    role: str,
    content: str,
) -> int:
    """Save one user or assistant conversation message."""
    if role not in {"user", "assistant"}:
        raise ValueError(
            "Conversation role must be user or assistant"
        )

    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute(
        """
        INSERT INTO conversation_messages (
            user_id,
            role,
            content,
            created_at
        )
        VALUES (?, ?, ?, ?)
        """,
        (
            user_id,
            role,
            content.strip(),
            datetime.now().isoformat(),
        ),
    )

    message_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return int(message_id)


def get_recent_conversation(
    user_id: str,
    turns: int = 5,
) -> list[dict]:
    """
    Return the latest conversation turns in chronological order.

    One turn normally contains one user and one assistant message.
    """
    message_limit = max(1, min(turns, 20)) * 2
    conn = get_conn()

    rows = conn.execute(
        """
        SELECT id, role, content, created_at
        FROM conversation_messages
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (user_id, message_limit),
    ).fetchall()

    conn.close()

    return [
        dict(row)
        for row in reversed(rows)
    ]


def clear_conversation(user_id: str) -> None:
    conn = get_conn()

    conn.execute(
        """
        DELETE FROM conversation_messages
        WHERE user_id = ?
        """,
        (user_id,),
    )

    conn.commit()
    conn.close()


def create_pending_action(
    user_id: str,
    action_type: str,
    payload: dict[str, Any],
) -> int:
    """Create an action that requires user confirmation."""
    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute(
        """
        INSERT INTO pending_actions (
            user_id,
            action_type,
            payload_json,
            status,
            created_at
        )
        VALUES (?, ?, ?, 'pending', ?)
        """,
        (
            user_id,
            action_type,
            json.dumps(payload),
            datetime.now().isoformat(),
        ),
    )

    action_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return int(action_id)


def get_pending_action(
    action_id: int,
    user_id: str,
) -> dict | None:
    conn = get_conn()

    row = conn.execute(
        """
        SELECT *
        FROM pending_actions
        WHERE id = ? AND user_id = ?
        """,
        (action_id, user_id),
    ).fetchone()

    conn.close()

    if row is None:
        return None

    result = dict(row)
    result["payload"] = json.loads(
        result.pop("payload_json")
    )

    return result


def complete_pending_action(
    action_id: int,
    user_id: str,
) -> None:
    conn = get_conn()

    conn.execute(
        """
        UPDATE pending_actions
        SET
            status = 'completed',
            completed_at = ?
        WHERE
            id = ?
            AND user_id = ?
            AND status = 'pending'
        """,
        (
            datetime.now().isoformat(),
            action_id,
            user_id,
        ),
    )

    conn.commit()
    conn.close()


def cancel_pending_action(
    action_id: int,
    user_id: str,
) -> None:
    conn = get_conn()

    conn.execute(
        """
        UPDATE pending_actions
        SET
            status = 'cancelled',
            completed_at = ?
        WHERE
            id = ?
            AND user_id = ?
            AND status = 'pending'
        """,
        (
            datetime.now().isoformat(),
            action_id,
            user_id,
        ),
    )

    conn.commit()
    conn.close()


def save_oauth_token(
    user_id: str,
    provider: str,
    token: dict,
) -> None:
    conn = get_conn()

    conn.execute(
        """
        INSERT INTO oauth_tokens (
            user_id,
            provider,
            token_json,
            updated_at
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, provider) DO UPDATE SET
            token_json = excluded.token_json,
            updated_at = excluded.updated_at
        """,
        (
            user_id,
            provider,
            json.dumps(token),
            datetime.now().isoformat(),
        ),
    )

    conn.commit()
    conn.close()


def get_oauth_token(
    user_id: str,
    provider: str,
) -> dict | None:
    conn = get_conn()

    row = conn.execute(
        """
        SELECT token_json
        FROM oauth_tokens
        WHERE user_id = ? AND provider = ?
        """,
        (user_id, provider),
    ).fetchone()

    conn.close()

    if row is None:
        return None

    return json.loads(row["token_json"])


def delete_oauth_token(
    user_id: str,
    provider: str,
) -> None:
    conn = get_conn()

    conn.execute(
        """
        DELETE FROM oauth_tokens
        WHERE user_id = ? AND provider = ?
        """,
        (user_id, provider),
    )

    conn.commit()
    conn.close()


def get_pattern_insight(
    user_id: str,
) -> str | None:
    """Return an insight based on request history."""
    conn = get_conn()

    scheduler_count = conn.execute(
        """
        SELECT COUNT(*)
        FROM request_history
        WHERE
            user_id = ?
            AND request_type = 'scheduler'
        """,
        (user_id,),
    ).fetchone()[0]

    total = conn.execute(
        """
        SELECT COUNT(*)
        FROM request_history
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()[0]

    conn.close()

    if scheduler_count >= 2:
        return (
            "You frequently use Sutra for scheduling. "
            "Consider protecting recurring deep-work blocks."
        )

    if total >= 3:
        return (
            "Sutra has enough history to identify recurring "
            "workflow patterns and make proactive suggestions."
        )

    if total >= 1:
        return (
            "Sutra is learning your patterns. Its suggestions "
            "will improve as you complete more workflows."
        )

    return None


if __name__ == "__main__":
    init_db()

    print(f"Database initialized at {DB_PATH}")
    print(
        "Recent conversation:",
        get_recent_conversation("vishwas"),
    )