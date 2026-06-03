"""
Sutra FastAPI server — exposes the orchestrator as an HTTP endpoint.
"""
import os
import traceback
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import init_db
from orchestrator import orchestrate, _response_cache

init_db()

# ============ CACHE PRE-WARMING ============
_DEMO_PROMPTS = [
    "friday meri sprint demo hai but mom is flying in from chennai. sort it out.",
    "what's on my calendar this week and what tasks do i have pending?",
    "draft a message to marcus about the q4 deck and add it to my tasks.",
    "i have an outdoor team offsite tomorrow, check the weather and reschedule if needed.",
    "i need 2 hours of deep work, activate focus mode and block my calendar.",
    "check my whatsapp for any schedule updates and update my calendar.",
]


def warm_cache():
    for prompt in _DEMO_PROMPTS:
        try:
            print(f"🔥 Warming cache: {prompt[:50]}")
            orchestrate(prompt)
            print(f"✅ Cached")
        except Exception as e:
            print(f"⚠️  Warming failed for '{prompt[:30]}': {e}")


# Only warm in production — wrapped in try/except so server starts even if Gemini is down
if os.getenv("K_SERVICE"):
    try:
        warm_cache()
    except Exception as e:
        print(f"⚠️ Cache warming failed, server starting without cache: {e}")


# ============ FASTAPI APP ============

app = FastAPI(
    title="Sutra API",
    description="Multi-agent chief of staff — 6 agents, orchestrated",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


class OrchestrateRequest(BaseModel):
    request: str
    user_id: str = "vishwas"


@app.get("/")
def root():
    return {
        "service": "Sutra",
        "status": "online",
        "version": "2.0.0",
        "agents": ["Orchestrator", "Scheduler", "TaskAgent", "Scribe", "WeatherAgent", "RoutineAgent", "ScreenAgent", "Learner"],
        "cached_prompts": len(_response_cache),
    }


@app.get("/health")
def health():
    return {"status": "healthy", "cached_prompts": len(_response_cache)}

@app.get("/api/events")
def get_events(user_id: str = "vishwas"):
    """Return all calendar events for the Schedule screen."""
    from tools import get_calendar_events
    return get_calendar_events(user_id=user_id)


@app.get("/api/tasks")
def get_tasks_endpoint(user_id: str = "vishwas"):
    """Return all tasks for the Schedule sidebar."""
    from tools import get_tasks
    return get_tasks(user_id=user_id)

@app.get("/api/history")
def get_history(user_id: str = "vishwas", limit: int = 20):
    """Return recent request history for the Logs screen."""
    from db import get_conn
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM request_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
        (user_id, limit),
    ).fetchall()
    conn.close()
    return {
        "status": "success",
        "count": len(rows),
        "history": [dict(r) for r in rows],
    }

@app.get("/api/insights")
def get_insights(user_id: str = "vishwas"):
    """Return Learner patterns and insights for the Knowledge screen."""
    from db import get_conn, get_pattern_insight
    conn = get_conn()

    # Aggregate stats per request type
    rows = conn.execute(
        """
        SELECT request_type, COUNT(*) as count, MAX(created_at) as last_used
        FROM request_history
        WHERE user_id = ?
        GROUP BY request_type
        ORDER BY count DESC
        """,
        (user_id,),
    ).fetchall()
    conn.close()

    patterns = [dict(r) for r in rows]
    current_insight = get_pattern_insight(user_id)

    return {
        "status": "success",
        "current_insight": current_insight,
        "patterns": patterns,
        "pattern_count": len(patterns),
    }

@app.post("/orchestrate")
def orchestrate_endpoint(payload: OrchestrateRequest):
    try:
        result = orchestrate(payload.request, payload.user_id)
        return result
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Orchestrate error: {error_msg}")
        traceback.print_exc()
        return JSONResponse(
            status_code=200,
            content={
                "user_request": payload.request,
                "plan": {"agents_needed": []},
                "results": [],
                "trace": [
                    {
                        "agent": "Orchestrator",
                        "type": "final",
                        "message": f"⚠️ Gemini API issue: {error_msg[:200]}. Try a cached demo prompt.",
                        "timestamp": "",
                    },
                ],
                "insight": None,
                "error": error_msg,
            },
        )