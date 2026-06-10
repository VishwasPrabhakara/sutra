"""Sutra multi-agent orchestrator with live event generation."""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Generator

from dotenv import load_dotenv
from google import genai
from google.genai import types

import tools
from db import get_pattern_insight, init_db, log_request

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH)

MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")

_response_cache: dict[str, dict] = {}


AGENT_CONFIG = {
    "scheduler": {
        "name": "Scheduler",
        "prompt": (
            "You manage calendars and scheduling conflicts. "
            "Check the calendar before suggesting changes. "
            "Use ISO 8601 timestamps with timezone offsets when rescheduling."
        ),
        "tools": [
            {
                "name": "get_calendar_events",
                "description": "Get the user's upcoming calendar events.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "date": {
                            "type": "string",
                            "description": "Optional YYYY-MM-DD date filter.",
                        }
                    },
                },
            },
            {
                "name": "reschedule_event",
                "description": "Move an existing event to a new date and time.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "event_title": {"type": "string"},
                        "new_start_time": {
                            "type": "string",
                            "description": (
                                "ISO 8601 timestamp, such as "
                                "2026-06-12T14:00:00+05:30."
                            ),
                        },
                    },
                    "required": ["event_title", "new_start_time"],
                },
            },
        ],
    },
    "tasks": {
        "name": "TaskAgent",
        "prompt": (
            "You manage the user's task list. Fetch, create, or complete "
            "tasks when the request requires it."
        ),
        "tools": [
            {
                "name": "get_tasks",
                "description": "Get tasks from the user's task list.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "status": {
                            "type": "string",
                            "enum": ["pending", "completed"],
                        }
                    },
                },
            },
            {
                "name": "create_task",
                "description": "Create a task.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "priority": {
                            "type": "string",
                            "enum": ["low", "medium", "high"],
                        },
                    },
                    "required": ["title"],
                },
            },
            {
                "name": "complete_task",
                "description": "Mark a matching task as completed.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_title": {"type": "string"}
                    },
                    "required": ["task_title"],
                },
            },
        ],
    },
    "scribe": {
        "name": "Scribe",
        "prompt": (
            "You draft clear, warm, professional messages. "
            "Keep the message concise."
        ),
        "tools": [
            {
                "name": "draft_message",
                "description": "Draft a message to a recipient.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "recipient": {"type": "string"},
                        "topic": {"type": "string"},
                        "context": {"type": "string"},
                    },
                    "required": ["recipient", "topic"],
                },
            }
        ],
    },
    "weather": {
        "name": "WeatherAgent",
        "prompt": (
            "You retrieve weather forecasts and provide practical advice "
            "for travel and outdoor plans."
        ),
        "tools": [
            {
                "name": "get_weather",
                "description": "Get a real weather forecast.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {"type": "string"},
                        "date": {
                            "type": "string",
                            "description": (
                                "today, tomorrow, a weekday, or YYYY-MM-DD"
                            ),
                        },
                    },
                },
            }
        ],
    },
    "research": {
        "name": "ResearchAgent",
        "prompt": (
            "You research current topics using web search and Hacker News. "
            "Summarize only information returned by the tools."
        ),
        "tools": [
            {
                "name": "search_web",
                "description": "Search the web for information.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "max_results": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 10,
                        },
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "get_hacker_news",
                "description": "Get current top Hacker News stories.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 20,
                        }
                    },
                },
            },
        ],
    },
    "routine": {
        "name": "RoutineAgent",
        "prompt": (
            "You manage focus mode and deep-work sessions. "
            "Choose a reasonable duration when one is not provided."
        ),
        "tools": [
            {
                "name": "set_focus_mode",
                "description": "Activate or deactivate focus mode.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "active": {"type": "boolean"},
                        "duration_minutes": {"type": "integer"},
                        "reason": {"type": "string"},
                    },
                    "required": ["active"],
                },
            }
        ],
    },
    "screen": {
        "name": "ScreenAgent",
        "prompt": (
            "You scan an authorized communication source for schedule "
            "updates and action items. Clearly identify that this tool "
            "currently uses demo data."
        ),
        "tools": [
            {
                "name": "scan_screen",
                "description": "Scan a demo communication source.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "source": {
                            "type": "string",
                            "enum": ["whatsapp", "slack", "email"],
                        }
                    },
                },
            }
        ],
    },
}


def timestamp() -> str:
    return datetime.now().isoformat()


def estimate_tokens(value: object) -> int:
    """Provide a lightweight UI estimate, not an exact billing count."""
    return max(1, len(json.dumps(value, default=str)) // 4)


_client: genai.Client | None = None


def get_client() -> genai.Client:
    global _client

    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")

        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        _client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=60_000),
        )

    return _client


def clean_json_response(text: str) -> str:
    text = text.strip()

    if text.startswith("```"):
        text = text.split("```", 2)[1]

        if text.startswith("json"):
            text = text[4:]

    return text.strip()


def fallback_plan(user_request: str) -> dict:
    """Create a deterministic plan if Gemini planning fails."""
    request = user_request.lower()
    agents = []

    keyword_groups = {
        "scheduler": [
            "calendar",
            "meeting",
            "schedule",
            "reschedule",
            "appointment",
            "demo",
        ],
        "tasks": ["task", "todo", "to-do", "remind"],
        "scribe": ["draft", "message", "email", "write"],
        "weather": [
            "weather",
            "rain",
            "forecast",
            "outdoor",
            "temperature",
        ],
        "research": [
            "search",
            "research",
            "news",
            "hacker news",
            "latest",
            "web",
        ],
        "routine": [
            "focus",
            "deep work",
            "dnd",
            "do not disturb",
        ],
        "screen": ["whatsapp", "slack", "scan screen"],
    }

    for agent, keywords in keyword_groups.items():
        if any(keyword in request for keyword in keywords):
            agents.append(agent)

    if not agents:
        agents = ["research"]

    plan = {"agents_needed": agents}

    for agent in agents:
        plan[f"{agent}_request"] = user_request

    return plan


def create_plan(user_request: str) -> dict:
    prompt = f"""
You are Sutra's orchestration planner.

Available agents:
- scheduler: calendar lookup and event rescheduling
- tasks: task lookup, creation, and completion
- scribe: drafting messages
- weather: real forecasts
- research: web search and Hacker News
- routine: focus mode
- screen: demo WhatsApp, Slack, or email scan

Return only valid JSON in this structure:
{{
  "agents_needed": ["scheduler", "weather"],
  "scheduler_request": "specific instruction",
  "weather_request": "specific instruction"
}}

Only include agents required for the request.

User request:
{user_request}
"""

    try:
        response = get_client().models.generate_content(
            model=MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            ),
        )

        plan = json.loads(clean_json_response(response.text))

        valid_agents = [
            agent
            for agent in plan.get("agents_needed", [])
            if agent in AGENT_CONFIG
        ]

        if not valid_agents:
            return fallback_plan(user_request)

        plan["agents_needed"] = valid_agents
        return plan

    except Exception as exc:
        print(f"Planner fallback activated: {exc}")
        return fallback_plan(user_request)


def execute_tool(
    tool_name: str,
    arguments: dict,
    user_id: str,
) -> dict:
    """Execute a declared tool while injecting the active user ID."""
    user_tools = {
        "get_calendar_events": tools.get_calendar_events,
        "reschedule_event": tools.reschedule_event,
        "get_tasks": tools.get_tasks,
        "create_task": tools.create_task,
        "complete_task": tools.complete_task,
    }

    general_tools = {
        "draft_message": tools.draft_message,
        "get_weather": tools.get_weather,
        "search_web": tools.search_web,
        "get_hacker_news": tools.get_hacker_news,
        "set_focus_mode": tools.set_focus_mode,
        "scan_screen": tools.scan_screen,
    }

    if tool_name in user_tools:
        return user_tools[tool_name](
            user_id=user_id,
            **arguments,
        )

    if tool_name in general_tools:
        return general_tools[tool_name](**arguments)

    return {
        "status": "error",
        "message": f"Unknown tool: {tool_name}",
    }


def run_sub_agent(
    agent_key: str,
    request: str,
    user_id: str,
) -> Generator[dict, None, dict]:
    """Run one specialized agent and emit live trace events."""
    config = AGENT_CONFIG[agent_key]
    agent_name = config["name"]

    yield {
        "agent": agent_name,
        "type": "thinking",
        "message": f"{agent_name} is analyzing its assignment.",
        "timestamp": timestamp(),
    }

    declarations = config["tools"]
    generation_config = types.GenerateContentConfig(
        system_instruction=config["prompt"],
        tools=[
            types.Tool(
                function_declarations=declarations
            )
        ],
    )

    try:
        response = get_client().models.generate_content(
            model=MODEL,
            contents=request,
            config=generation_config,
        )
    except Exception as exc:
        result = {
            "agent": agent_name,
            "summary": f"{agent_name} failed: {exc}",
            "tool_results": [],
        }

        yield {
            "agent": agent_name,
            "type": "error",
            "message": result["summary"],
            "timestamp": timestamp(),
        }

        return result

    tool_results = []

    if response.candidates:
        parts = response.candidates[0].content.parts or []

        for part in parts:
            function_call = getattr(part, "function_call", None)

            if not function_call:
                continue

            tool_name = function_call.name
            arguments = dict(function_call.args or {})

            yield {
                "agent": agent_name,
                "type": "tool_call",
                "message": f"Calling {tool_name}",
                "tool": tool_name,
                "args": arguments,
                "timestamp": timestamp(),
            }

            try:
                tool_result = execute_tool(
                    tool_name=tool_name,
                    arguments=arguments,
                    user_id=user_id,
                )
            except Exception as exc:
                tool_result = {
                    "status": "error",
                    "message": str(exc),
                }

            tool_results.append(
                {
                    "tool": tool_name,
                    "result": tool_result,
                }
            )

            yield {
                "agent": agent_name,
                "type": "tool_result",
                "message": f"{tool_name} completed.",
                "tool": tool_name,
                "result": tool_result,
                "timestamp": timestamp(),
            }

    summary = response.text.strip() if response.text else ""

    if not summary and tool_results:
        successful_tools = ", ".join(
            item["tool"] for item in tool_results
        )
        summary = f"Completed using {successful_tools}."

    if not summary:
        summary = f"{agent_name} completed its assignment."

    result = {
        "agent": agent_name,
        "summary": summary,
        "tool_results": tool_results,
    }

    yield {
        "agent": agent_name,
        "type": "complete",
        "message": summary,
        "timestamp": timestamp(),
    }

    return result


def orchestrate_events(
    user_request: str,
    user_id: str = "vishwas",
) -> Generator[dict, None, None]:
    """Yield orchestration events suitable for SSE streaming."""
    cache_key = f"{user_id}:{user_request.strip().lower()}"
    token_estimate = estimate_tokens(user_request)

    if cache_key in _response_cache:
        cached = _response_cache[cache_key]

        for step in cached["trace"]:
            token_estimate += estimate_tokens(step)

            yield {
                "event": "trace",
                "data": step,
                "token_count": token_estimate,
                "cached": True,
            }

        yield {
            "event": "complete",
            "data": cached,
            "token_count": token_estimate,
            "cached": True,
        }
        return

    trace = []
    results = []

    first_step = {
        "agent": "Orchestrator",
        "type": "thinking",
        "message": (
            "Decomposing the request and selecting specialized agents."
        ),
        "timestamp": timestamp(),
    }

    trace.append(first_step)
    token_estimate += estimate_tokens(first_step)

    yield {
        "event": "trace",
        "data": first_step,
        "token_count": token_estimate,
    }

    plan = create_plan(user_request)
    agents_needed = plan.get("agents_needed", [])

    plan_step = {
        "agent": "Orchestrator",
        "type": "plan",
        "message": (
            "Dispatching to: "
            + ", ".join(
                AGENT_CONFIG[agent]["name"]
                for agent in agents_needed
            )
        ),
        "agents": [
            AGENT_CONFIG[agent]["name"]
            for agent in agents_needed
        ],
        "timestamp": timestamp(),
    }

    trace.append(plan_step)
    token_estimate += estimate_tokens(plan)

    yield {
        "event": "plan",
        "data": {
            "plan": plan,
            "step": plan_step,
        },
        "token_count": token_estimate,
    }

    for agent_key in agents_needed:
        request = plan.get(
            f"{agent_key}_request",
            user_request,
        )

        generator = run_sub_agent(
            agent_key=agent_key,
            request=request,
            user_id=user_id,
        )

        while True:
            try:
                step = next(generator)
                trace.append(step)
                token_estimate += estimate_tokens(step)

                yield {
                    "event": "trace",
                    "data": step,
                    "token_count": token_estimate,
                }

            except StopIteration as finished:
                if finished.value:
                    results.append(finished.value)
                break

    request_type = agents_needed[0] if agents_needed else "unknown"

    log_request(
        user_id=user_id,
        request_text=user_request,
        request_type=request_type,
    )

    insight = get_pattern_insight(user_id)

    if insight:
        insight_step = {
            "agent": "Learner",
            "type": "insight",
            "message": insight,
            "timestamp": timestamp(),
        }

        trace.append(insight_step)
        token_estimate += estimate_tokens(insight_step)

        yield {
            "event": "trace",
            "data": insight_step,
            "token_count": token_estimate,
        }

    summaries = [
        result["summary"]
        for result in results
        if result.get("summary")
    ]

    final_summary = (
        " ".join(summaries)
        if summaries
        else "The workflow completed without a generated summary."
    )

    final_step = {
        "agent": "Orchestrator",
        "type": "final",
        "message": final_summary,
        "timestamp": timestamp(),
    }

    trace.append(final_step)
    token_estimate += estimate_tokens(final_step)

    yield {
        "event": "trace",
        "data": final_step,
        "token_count": token_estimate,
    }

    result = {
        "user_request": user_request,
        "plan": plan,
        "results": results,
        "trace": trace,
        "insight": insight,
        "token_count": token_estimate,
    }

    _response_cache[cache_key] = result

    yield {
        "event": "complete",
        "data": result,
        "token_count": token_estimate,
    }


def orchestrate(
    user_request: str,
    user_id: str = "vishwas",
) -> dict:
    """Compatibility wrapper for the existing JSON endpoint."""
    final_result = None

    for event in orchestrate_events(user_request, user_id):
        if event["event"] == "complete":
            final_result = event["data"]

    if final_result is None:
        raise RuntimeError("Orchestration ended without a result")

    return final_result


if __name__ == "__main__":
    init_db()

    prompt = (
        "Check tomorrow's weather in Bengaluru and show my calendar."
    )

    for stream_event in orchestrate_events(prompt):
        print(json.dumps(stream_event, indent=2, default=str))