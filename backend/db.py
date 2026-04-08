"""
Sutra database — SQLite for storing user requests and agent memory.
The Learner agent reads from request_history to detect patterns.
"""
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "sutra.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create tables if they don't exist. Safe to call multiple times."""
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS request_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            request_text TEXT NOT NULL,
            request_type TEXT,
            created_at TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            priority TEXT DEFAULT 'medium',
            created_at TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS calendar_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # Seed some demo data so the agents have something to work with
    cur.execute("SELECT COUNT(*) FROM calendar_events")
    if cur.fetchone()[0] == 0:
        seed_demo_data(cur)

    conn.commit()
    conn.close()


def seed_demo_data(cur):
    """Pre-fill calendar and tasks so demo looks real."""
    now = datetime.now().isoformat()
    cur.executemany(
        "INSERT INTO calendar_events (user_id, title, start_time, end_time, created_at) VALUES (?, ?, ?, ?, ?)",
        [
            ("vishwas", "Sprint Demo", "2026-04-10 14:00", "2026-04-10 15:00", now),
            ("vishwas", "1:1 with Marcus", "2026-04-10 11:00", "2026-04-10 11:30", now),
            ("vishwas", "Design Review", "2026-04-11 10:00", "2026-04-11 11:00", now),
        ],
    )
    cur.executemany(
        "INSERT INTO tasks (user_id, title, status, priority, created_at) VALUES (?, ?, ?, ?, ?)",
        [
            ("vishwas", "Send Q4 deck to Marcus", "pending", "high", now),
            ("vishwas", "Review PR #234", "pending", "medium", now),
            ("vishwas", "Book flight to Chennai", "pending", "low", now),
        ],
    )


def log_request(user_id: str, request_text: str, request_type: str):
    conn = get_conn()
    conn.execute(
        "INSERT INTO request_history (user_id, request_text, request_type, created_at) VALUES (?, ?, ?, ?)",
        (user_id, request_text, request_type, datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()


def get_pattern_insight(user_id: str) -> str | None:
    """
    The Learner's brain. Looks at recent request history and
    returns a proactive suggestion if it sees a pattern.
    This is the 'self-improving' wow factor — it's deterministic SQL.
    """
    conn = get_conn()
    cur = conn.cursor()

    # Pattern 1: User reschedules things often → suggest defaults
    cur.execute(
        "SELECT COUNT(*) FROM request_history WHERE user_id = ? AND request_type = 'reschedule'",
        (user_id,),
    )
    reschedule_count = cur.fetchone()[0]

    # Pattern 2: Total request count → become more proactive over time
    cur.execute(
        "SELECT COUNT(*) FROM request_history WHERE user_id = ?",
        (user_id,),
    )
    total = cur.fetchone()[0]

    conn.close()

    if reschedule_count >= 2:
        return "I've noticed you reschedule sprint demos often. Want me to default them to mornings going forward?"
    if total >= 3:
        return "Based on your patterns this week, Friday afternoons are your highest-conflict slots. Consider blocking them for deep work."
    if total >= 1:
        return "I'm learning your patterns. The more you use Sutra, the more proactive I'll become."
    return None


if __name__ == "__main__":
    init_db()
    print(f"✅ Database initialized at {DB_PATH}")