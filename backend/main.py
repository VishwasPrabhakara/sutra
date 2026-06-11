"""FastAPI server for Sutra."""

import json
import os
import traceback
from pathlib import Path
from typing import Generator

from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    JSONResponse,
    RedirectResponse,
    StreamingResponse,
)
from pydantic import BaseModel

from auth import (
    create_authorization_url,
    disconnect_calendar,
    exchange_authorization_code,
    get_connection_status,
    get_frontend_redirect,
)
from db import (
    cancel_pending_action,
    clear_conversation,
    complete_pending_action,
    get_conn,
    get_pattern_insight,
    get_pending_action,
    get_recent_conversation,
    init_db,
)
from gmail_service import send_email
from orchestrator import (
    _response_cache,
    orchestrate,
    orchestrate_events,
)
from tools import (
    get_calendar_events,
    get_tasks,
)

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH)

init_db()

app = FastAPI(
    title="Sutra API",
    description=(
        "Streaming multi-agent AI chief of staff "
        "with conversation memory"
    ),
    version="4.0.0",
)


def get_allowed_origins() -> list[str]:
    value = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173",
    )

    return [
        origin.strip()
        for origin in value.split(",")
        if origin.strip()
    ]


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Type"],
)


class OrchestrateRequest(BaseModel):
    request: str
    user_id: str = "vishwas"
    demo_mode: bool = False


class ActionRequest(BaseModel):
    user_id: str = "vishwas"


@app.get("/")
def root() -> dict:
    return {
        "service": "Sutra",
        "status": "online",
        "version": "4.0.0",
        "streaming": True,
        "conversation_memory": True,
        "gmail_confirmation": True,
        "calendar_write": True,
        "agents": [
            "Orchestrator",
            "Scheduler",
            "TaskAgent",
            "Scribe",
            "WeatherAgent",
            "ResearchAgent",
            "Learner",
        ],
        "cached_prompts": len(_response_cache),
    }


@app.get("/health")
def health() -> dict:
    return {
        "status": "healthy",
        "version": "4.0.0",
        "cached_prompts": len(_response_cache),
    }


# ==================== ORCHESTRATION ====================

@app.post("/orchestrate")
def orchestrate_endpoint(
    payload: OrchestrateRequest,
):
    """Return one complete orchestration response."""
    request_text = payload.request.strip()

    if not request_text:
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "message": "Request cannot be empty",
            },
        )

    try:
        return orchestrate(
            user_request=request_text,
            user_id=payload.user_id,
            demo_mode=payload.demo_mode,
        )

    except Exception as exc:
        traceback.print_exc()

        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": str(exc),
            },
        )


@app.post("/orchestrate/stream")
def orchestrate_stream_endpoint(
    payload: OrchestrateRequest,
):
    """Stream orchestration using Server-Sent Events."""
    request_text = payload.request.strip()

    def event_stream() -> Generator[
        str,
        None,
        None,
    ]:
        if not request_text:
            yield format_sse_event(
                "error",
                {
                    "event": "error",
                    "data": {
                        "message": (
                            "Request cannot be empty"
                        ),
                    },
                },
            )
            return

        try:
            for event in orchestrate_events(
                user_request=request_text,
                user_id=payload.user_id,
                demo_mode=payload.demo_mode,
            ):
                yield format_sse_event(
                    event.get(
                        "event",
                        "message",
                    ),
                    event,
                )

        except Exception as exc:
            traceback.print_exc()

            yield format_sse_event(
                "error",
                {
                    "event": "error",
                    "data": {
                        "message": str(exc),
                    },
                },
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": (
                "no-cache, no-transform"
            ),
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def format_sse_event(
    event_name: str,
    payload: dict,
) -> str:
    serialized = json.dumps(
        payload,
        default=str,
        ensure_ascii=False,
    )

    return (
        f"event: {event_name}\n"
        f"data: {serialized}\n\n"
    )


# ==================== GOOGLE OAUTH ====================

@app.get("/auth/login")
def auth_login(
    user_id: str = Query(
        default="vishwas"
    ),
):
    """Redirect to Google's OAuth consent screen."""
    try:
        authorization_url = (
            create_authorization_url(user_id)
        )

        return RedirectResponse(
            authorization_url
        )

    except Exception as exc:
        traceback.print_exc()

        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": str(exc),
            },
        )


@app.get("/auth/callback")
def auth_callback(
    code: str,
    state: str,
):
    """Store the OAuth credentials after consent."""
    try:
        exchange_authorization_code(
            code=code,
            state=state,
        )

        return RedirectResponse(
            get_frontend_redirect(
                "connected"
            )
        )

    except Exception:
        traceback.print_exc()

        return RedirectResponse(
            get_frontend_redirect("error")
        )


@app.get("/auth/status")
def auth_status(
    user_id: str = Query(
        default="vishwas"
    ),
):
    return get_connection_status(user_id)


@app.post("/auth/disconnect")
def auth_disconnect(
    user_id: str = Query(
        default="vishwas"
    ),
):
    disconnect_calendar(user_id)

    return {
        "status": "success",
        "connected": False,
        "calendar_connected": False,
        "gmail_connected": False,
    }


# ==================== CONVERSATION ====================

@app.get("/api/conversation")
def conversation_endpoint(
    user_id: str = Query(
        default="vishwas"
    ),
    turns: int = Query(
        default=5,
        ge=1,
        le=20,
    ),
):
    messages = get_recent_conversation(
        user_id=user_id,
        turns=turns,
    )

    return {
        "status": "success",
        "count": len(messages),
        "messages": messages,
    }


@app.delete("/api/conversation")
def clear_conversation_endpoint(
    user_id: str = Query(
        default="vishwas"
    ),
):
    clear_conversation(user_id)

    return {
        "status": "success",
        "message": (
            "Conversation history cleared"
        ),
    }


# ==================== CONFIRMATIONS ====================

@app.get("/api/actions/{action_id}")
def get_action_endpoint(
    action_id: int,
    user_id: str = Query(
        default="vishwas"
    ),
):
    action = get_pending_action(
        action_id=action_id,
        user_id=user_id,
    )

    if action is None:
        return JSONResponse(
            status_code=404,
            content={
                "status": "error",
                "message": (
                    "Pending action not found"
                ),
            },
        )

    return {
        "status": "success",
        "action": action,
    }


@app.post("/api/actions/{action_id}/confirm")
def confirm_action_endpoint(
    action_id: int,
    payload: ActionRequest,
):
    """
    Execute an action after explicit user confirmation.

    Currently supported:
    - send_email
    """
    action = get_pending_action(
        action_id=action_id,
        user_id=payload.user_id,
    )

    if action is None:
        return JSONResponse(
            status_code=404,
            content={
                "status": "error",
                "message": (
                    "Pending action not found"
                ),
            },
        )

    if action["status"] != "pending":
        return JSONResponse(
            status_code=409,
            content={
                "status": "error",
                "message": (
                    "This action has already been "
                    f"{action['status']}"
                ),
            },
        )

    try:
        if action["action_type"] == "send_email":
            email = action["payload"]

            result = send_email(
                user_id=payload.user_id,
                recipient=email["recipient"],
                subject=email["subject"],
                body=email["body"],
                cc=email.get("cc", []),
            )
        else:
            return JSONResponse(
                status_code=400,
                content={
                    "status": "error",
                    "message": (
                        "Unsupported action type: "
                        f"{action['action_type']}"
                    ),
                },
            )

        complete_pending_action(
            action_id=action_id,
            user_id=payload.user_id,
        )

        return {
            "status": "success",
            "action_id": action_id,
            "result": result,
        }

    except Exception as exc:
        traceback.print_exc()

        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": str(exc),
            },
        )


@app.post("/api/actions/{action_id}/cancel")
def cancel_action_endpoint(
    action_id: int,
    payload: ActionRequest,
):
    action = get_pending_action(
        action_id=action_id,
        user_id=payload.user_id,
    )

    if action is None:
        return JSONResponse(
            status_code=404,
            content={
                "status": "error",
                "message": (
                    "Pending action not found"
                ),
            },
        )

    if action["status"] != "pending":
        return JSONResponse(
            status_code=409,
            content={
                "status": "error",
                "message": (
                    "This action has already been "
                    f"{action['status']}"
                ),
            },
        )

    cancel_pending_action(
        action_id=action_id,
        user_id=payload.user_id,
    )

    return {
        "status": "success",
        "action_id": action_id,
        "message": "Action cancelled",
    }


# ==================== APPLICATION DATA ====================

@app.get("/api/events")
def events_endpoint(
    user_id: str = Query(
        default="vishwas"
    ),
    date: str | None = Query(
        default=None
    ),
):
    return get_calendar_events(
        user_id=user_id,
        date=date,
    )


@app.get("/api/tasks")
def tasks_endpoint(
    user_id: str = Query(
        default="vishwas"
    ),
    status: str | None = Query(
        default=None
    ),
):
    return get_tasks(
        user_id=user_id,
        status=status,
    )


@app.get("/api/history")
def history_endpoint(
    user_id: str = Query(
        default="vishwas"
    ),
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
    ),
):
    conn = get_conn()

    rows = conn.execute(
        """
        SELECT *
        FROM request_history
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (
            user_id,
            limit,
        ),
    ).fetchall()

    conn.close()

    return {
        "status": "success",
        "count": len(rows),
        "history": [
            dict(row)
            for row in rows
        ],
    }


@app.get("/api/insights")
def insights_endpoint(
    user_id: str = Query(
        default="vishwas"
    ),
):
    conn = get_conn()

    rows = conn.execute(
        """
        SELECT
            request_type,
            COUNT(*) AS count,
            MAX(created_at) AS last_used
        FROM request_history
        WHERE user_id = ?
        GROUP BY request_type
        ORDER BY count DESC
        """,
        (user_id,),
    ).fetchall()

    conn.close()

    patterns = [
        dict(row)
        for row in rows
    ]

    return {
        "status": "success",
        "current_insight": (
            get_pattern_insight(user_id)
        ),
        "patterns": patterns,
        "pattern_count": len(patterns),
    }
