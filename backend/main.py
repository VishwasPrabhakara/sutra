"""FastAPI server for Sutra."""

import json
import os
import traceback
from pathlib import Path
from typing import Generator

from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel

from auth import (
    create_authorization_url,
    disconnect_calendar,
    exchange_authorization_code,
    get_connection_status,
    get_frontend_redirect,
)
from db import get_conn, get_pattern_insight, init_db
from orchestrator import _response_cache, orchestrate, orchestrate_events
from tools import get_calendar_events, get_tasks

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH)

init_db()

app = FastAPI(
    title="Sutra API",
    description="Streaming multi-agent AI chief of staff",
    version="3.0.0",
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Type"],
)


class OrchestrateRequest(BaseModel):
    request: str
    user_id: str = "vishwas"


@app.get("/")
def root() -> dict:
    return {
        "service": "Sutra",
        "status": "online",
        "version": "3.0.0",
        "streaming": True,
        "agents": [
            "Orchestrator",
            "Scheduler",
            "TaskAgent",
            "Scribe",
            "WeatherAgent",
            "ResearchAgent",
            "RoutineAgent",
            "ScreenAgent",
            "Learner",
        ],
        "cached_prompts": len(_response_cache),
    }


@app.get("/health")
def health() -> dict:
    return {
        "status": "healthy",
        "cached_prompts": len(_response_cache),
    }


# ==================== ORCHESTRATION ====================

@app.post("/orchestrate")
def orchestrate_endpoint(
    payload: OrchestrateRequest,
):
    """Compatibility endpoint returning one complete JSON response."""
    try:
        return orchestrate(
            user_request=payload.request,
            user_id=payload.user_id,
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
    """Stream orchestration activity using Server-Sent Events."""

    def event_stream() -> Generator[str, None, None]:
        try:
            for event in orchestrate_events(
                user_request=payload.request,
                user_id=payload.user_id,
            ):
                event_name = event.get("event", "message")
                serialized = json.dumps(
                    event,
                    default=str,
                    ensure_ascii=False,
                )

                yield (
                    f"event: {event_name}\n"
                    f"data: {serialized}\n\n"
                )

        except Exception as exc:
            traceback.print_exc()

            error_event = {
                "event": "error",
                "data": {
                    "message": str(exc),
                },
            }

            yield (
                "event: error\n"
                f"data: {json.dumps(error_event)}\n\n"
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ==================== GOOGLE OAUTH ====================

@app.get("/auth/login")
def auth_login(
    user_id: str = Query(default="vishwas"),
):
    """Redirect the browser to Google's OAuth consent screen."""
    try:
        authorization_url = create_authorization_url(user_id)
        return RedirectResponse(authorization_url)
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
    """Receive Google's OAuth callback and store the credentials."""
    try:
        exchange_authorization_code(
            code=code,
            state=state,
        )

        return RedirectResponse(
            get_frontend_redirect("connected")
        )

    except Exception:
        traceback.print_exc()

        return RedirectResponse(
            get_frontend_redirect("error")
        )


@app.get("/auth/status")
def auth_status(
    user_id: str = Query(default="vishwas"),
):
    return get_connection_status(user_id)


@app.post("/auth/disconnect")
def auth_disconnect(
    user_id: str = Query(default="vishwas"),
):
    disconnect_calendar(user_id)

    return {
        "status": "success",
        "connected": False,
    }


# ==================== DATA ENDPOINTS ====================

@app.get("/api/events")
def events_endpoint(
    user_id: str = Query(default="vishwas"),
    date: str | None = Query(default=None),
):
    return get_calendar_events(
        user_id=user_id,
        date=date,
    )


@app.get("/api/tasks")
def tasks_endpoint(
    user_id: str = Query(default="vishwas"),
    status: str | None = Query(default=None),
):
    return get_tasks(
        user_id=user_id,
        status=status,
    )


@app.get("/api/history")
def history_endpoint(
    user_id: str = Query(default="vishwas"),
    limit: int = Query(default=20, ge=1, le=100),
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
        (user_id, limit),
    ).fetchall()

    conn.close()

    return {
        "status": "success",
        "count": len(rows),
        "history": [dict(row) for row in rows],
    }


@app.get("/api/insights")
def insights_endpoint(
    user_id: str = Query(default="vishwas"),
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

    patterns = [dict(row) for row in rows]

    return {
        "status": "success",
        "current_insight": get_pattern_insight(user_id),
        "patterns": patterns,
        "pattern_count": len(patterns),
    }