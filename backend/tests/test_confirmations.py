import json

import db
import main
import tools


def count_user_events(user_id: str) -> int:
    conn = db.get_conn()
    try:
        return conn.execute(
            "SELECT COUNT(*) FROM calendar_events WHERE user_id = ?",
            (user_id,),
        ).fetchone()[0]
    finally:
        conn.close()


def test_calendar_create_requires_confirmation(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "sutra.db")
    db.init_db()
    user_id = "demo-test-create"

    prepared = tools.create_event(
        title="Design review",
        start_time="2026-06-15T10:00:00+05:30",
        user_id=user_id,
    )

    assert prepared["status"] == "confirmation_required"
    assert prepared["requires_confirmation"] is True
    assert count_user_events(user_id) == 0

    response = main.confirm_action_endpoint(
        prepared["action_id"],
        main.ActionRequest(user_id=user_id),
    )

    assert response["status"] == "success"
    assert response["result"]["source"] == "local"
    assert count_user_events(user_id) == 1


def test_calendar_reschedule_requires_confirmation(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "sutra.db")
    db.init_db()
    user_id = "demo-test-reschedule"
    tools.execute_create_event(
        title="Planning",
        start_time="2026-06-15T10:00:00+05:30",
        user_id=user_id,
    )

    prepared = tools.reschedule_event(
        event_title="Planning",
        new_start_time="2026-06-16T11:00:00+05:30",
        user_id=user_id,
    )

    assert prepared["status"] == "confirmation_required"

    response = main.confirm_action_endpoint(
        prepared["action_id"],
        main.ActionRequest(user_id=user_id),
    )

    assert response["status"] == "success"
    assert "2026-06-16T11:00:00+05:30" in response["result"]["message"]


def test_cancelled_action_cannot_be_confirmed(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "sutra.db")
    db.init_db()
    user_id = "demo-test-cancel"
    prepared = tools.create_event(
        title="Cancelled meeting",
        start_time="2026-06-15T10:00:00+05:30",
        user_id=user_id,
    )

    cancel_response = main.cancel_action_endpoint(
        prepared["action_id"],
        main.ActionRequest(user_id=user_id),
    )
    confirm_response = main.confirm_action_endpoint(
        prepared["action_id"],
        main.ActionRequest(user_id=user_id),
    )

    assert cancel_response["status"] == "success"
    assert confirm_response.status_code == 409
    assert json.loads(confirm_response.body)["status"] == "error"
    assert count_user_events(user_id) == 0


def test_prepare_email_rejects_invalid_recipient(monkeypatch):
    monkeypatch.setattr(tools, "is_gmail_connected", lambda _: True)

    result = tools.prepare_email(
        recipient="not-an-email",
        subject="Status",
        body="Hello",
        user_id="demo-test-email",
    )

    assert result["status"] == "invalid"
