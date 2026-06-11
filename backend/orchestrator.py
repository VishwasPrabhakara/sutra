"""Sutra multi-agent orchestrator with streaming and memory."""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Generator

from dotenv import load_dotenv
from google import genai
from google.genai import types

import tools
from db import (
    get_pattern_insight,
    get_recent_conversation,
    init_db,
    log_request,
    save_conversation_message,
)

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH)

MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-flash-latest",
)

_client: genai.Client | None = None
_response_cache: dict[str, dict] = {}


AGENT_CONFIG = {
    "scheduler": {
        "name": "Scheduler",
        "prompt": (
                "You manage calendars and scheduling. "
                "Use ISO 8601 timestamps with timezone offsets. "
                "The user's timezone is Asia/Kolkata. "
                "When the user explicitly asks to create, add, book, "
                "or schedule an event, call create_event in the same turn. "
                "Do not merely check availability and ask for confirmation. "
                "When the user asks to move an existing event, call "
                "reschedule_event. "
                "Never claim an event was created or rescheduled unless "
                "the corresponding tool returned status success."
            ),
        "tools": [
            {
                "name": "get_calendar_events",
                "description": (
                    "Get upcoming calendar events."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "date": {
                            "type": "string",
                            "description": (
                                "Optional YYYY-MM-DD date."
                            ),
                        }
                    },
                },
            },
            {
                "name": "create_event",
                "description": (
                    "Create a calendar event."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                        },
                        "start_time": {
                            "type": "string",
                            "description": (
                                "ISO 8601 timestamp with "
                                "timezone offset."
                            ),
                        },
                        "end_time": {
                            "type": "string",
                            "description": (
                                "Optional ISO 8601 timestamp."
                            ),
                        },
                        "description": {
                            "type": "string",
                        },
                        "location": {
                            "type": "string",
                        },
                        "attendees": {
                            "type": "array",
                            "items": {
                                "type": "string",
                            },
                        },
                        "timezone_name": {
                            "type": "string",
                        },
                    },
                    "required": [
                        "title",
                        "start_time",
                    ],
                },
            },
            {
                "name": "reschedule_event",
                "description": (
                    "Move an existing event."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "event_title": {
                            "type": "string",
                        },
                        "new_start_time": {
                            "type": "string",
                            "description": (
                                "ISO 8601 timestamp with "
                                "timezone offset."
                            ),
                        },
                    },
                    "required": [
                        "event_title",
                        "new_start_time",
                    ],
                },
            },
        ],
    },
    "tasks": {
        "name": "TaskAgent",
        "prompt": (
            "You manage tasks. Fetch, create, or complete "
            "tasks according to the user's request."
        ),
        "tools": [
            {
                "name": "get_tasks",
                "description": "Get the user's tasks.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "status": {
                            "type": "string",
                            "enum": [
                                "pending",
                                "completed",
                            ],
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
                        "title": {
                            "type": "string",
                        },
                        "priority": {
                            "type": "string",
                            "enum": [
                                "low",
                                "medium",
                                "high",
                            ],
                        },
                    },
                    "required": ["title"],
                },
            },
            {
                "name": "complete_task",
                "description": (
                    "Complete a matching task."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_title": {
                            "type": "string",
                        }
                    },
                    "required": ["task_title"],
                },
            },
        ],
    },
    "scribe": {
        "name": "Scribe",
        "prompt": (
            "You draft professional messages and prepare "
            "emails. Never claim an email was sent. "
            "Use prepare_email only when the user provides "
            "a real recipient email address and asks to send. "
            "Email sending always requires confirmation."
        ),
        "tools": [
            {
                "name": "draft_message",
                "description": (
                    "Draft a message without sending it."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "recipient": {
                            "type": "string",
                        },
                        "topic": {
                            "type": "string",
                        },
                        "context": {
                            "type": "string",
                        },
                    },
                    "required": [
                        "recipient",
                        "topic",
                    ],
                },
            },
            {
                "name": "prepare_email",
                "description": (
                    "Prepare an email for user confirmation. "
                    "This does not send it."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "recipient": {
                            "type": "string",
                            "description": (
                                "Recipient email address."
                            ),
                        },
                        "subject": {
                            "type": "string",
                        },
                        "body": {
                            "type": "string",
                        },
                        "cc": {
                            "type": "array",
                            "items": {
                                "type": "string",
                            },
                        },
                    },
                    "required": [
                        "recipient",
                        "subject",
                        "body",
                    ],
                },
            },
        ],
    },
    "weather": {
        "name": "WeatherAgent",
        "prompt": (
            "You retrieve weather forecasts and provide "
            "practical advice."
        ),
        "tools": [
            {
                "name": "get_weather",
                "description": (
                    "Get a real weather forecast."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                        },
                        "date": {
                            "type": "string",
                            "description": (
                                "today, tomorrow, weekday, "
                                "or YYYY-MM-DD."
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
            "You research using the available tools. "
            "Only summarize information returned by tools."
        ),
        "tools": [
            {
                "name": "search_web",
                "description": "Search the web.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                        },
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
                "description": (
                    "Get current Hacker News stories."
                ),
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
            "You manage focus mode and deep-work sessions."
        ),
        "tools": [
            {
                "name": "set_focus_mode",
                "description": (
                    "Activate or deactivate focus mode."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "active": {
                            "type": "boolean",
                        },
                        "duration_minutes": {
                            "type": "integer",
                        },
                        "reason": {
                            "type": "string",
                        },
                    },
                    "required": ["active"],
                },
            }
        ],
    },
    "screen": {
        "name": "ScreenAgent",
        "prompt": (
            "You scan a demonstration communication source. "
            "Clearly state that the scan uses demo data."
        ),
        "tools": [
            {
                "name": "scan_screen",
                "description": (
                    "Scan a demo communication source."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "source": {
                            "type": "string",
                            "enum": [
                                "whatsapp",
                                "slack",
                                "email",
                            ],
                        }
                    },
                },
            }
        ],
    },
}


def get_client() -> genai.Client:
    """Return one reusable Gemini client."""
    global _client

    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")

        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is not configured"
            )

        _client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(
                timeout=60_000
            ),
        )

    return _client


def timestamp() -> str:
    return datetime.now().isoformat()


def current_context() -> str:
    return (
        f"Current local date and time: "
        f"{datetime.now().isoformat()}. "
        "User timezone: Asia/Kolkata."
    )


def estimate_tokens(value: object) -> int:
    """Approximate tokens for UI display only."""
    serialized = json.dumps(
        value,
        default=str,
        ensure_ascii=False,
    )

    return max(1, len(serialized) // 4)


def format_conversation(
    conversation: list[dict],
) -> str:
    if not conversation:
        return "No previous conversation."

    return "\n".join(
        f"{message['role'].upper()}: "
        f"{message['content']}"
        for message in conversation
    )


def clean_json_response(text: str) -> str:
    text = text.strip()

    if text.startswith("```"):
        text = text.split("```", 2)[1]

        if text.startswith("json"):
            text = text[4:]

    return text.strip()


def fallback_plan(user_request: str) -> dict:
    request = user_request.lower()
    agents: list[str] = []

    keyword_groups = {
        "scheduler": [
            "calendar",
            "meeting",
            "schedule",
            "reschedule",
            "appointment",
            "event",
            "demo",
        ],
        "tasks": [
            "task",
            "todo",
            "to-do",
            "remind",
        ],
        "scribe": [
            "draft",
            "message",
            "email",
            "send",
            "write",
        ],
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
        "screen": [
            "whatsapp",
            "slack",
            "scan screen",
        ],
    }

    for agent, keywords in keyword_groups.items():
        if any(
            keyword in request
            for keyword in keywords
        ):
            agents.append(agent)

    if not agents:
        agents = ["research"]

    plan: dict = {
        "agents_needed": agents,
    }

    for agent in agents:
        plan[f"{agent}_request"] = user_request

    return plan


def create_plan(
    user_request: str,
    conversation: list[dict],
) -> dict:
    history = format_conversation(
        conversation
    )

    prompt = f"""
You are Sutra's orchestration planner.

{current_context()}

Available agents:
- scheduler: calendar lookup, creation, rescheduling
- tasks: task lookup, creation, completion
- scribe: message drafting and email preparation
- weather: real forecasts
- research: web search and Hacker News
- routine: focus mode
- screen: demo WhatsApp, Slack, or email scan

Use previous conversation context to resolve follow-up
requests such as "move it to 3 PM" or "send that to him".

Previous conversation:
{history}

Current user request:
{user_request}

Return only valid JSON:
{{
  "agents_needed": ["scheduler"],
  "scheduler_request": "fully resolved instruction"
}}

Only include agents required for this request.
"""

    try:
        response = (
            get_client()
            .models
            .generate_content(
                model=MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type=(
                        "application/json"
                    )
                ),
            )
        )

        plan = json.loads(
            clean_json_response(response.text)
        )

        valid_agents = [
            agent
            for agent in plan.get(
                "agents_needed",
                [],
            )
            if agent in AGENT_CONFIG
        ]

        if not valid_agents:
            return fallback_plan(user_request)

        plan["agents_needed"] = valid_agents
        return plan

    except Exception as exc:
        print(
            f"Planner fallback activated: {exc}"
        )

        return fallback_plan(user_request)


def execute_tool(
    tool_name: str,
    arguments: dict,
    user_id: str,
) -> dict:
    """Execute a tool and inject the active user ID."""
    user_tools = {
        "get_calendar_events": (
            tools.get_calendar_events
        ),
        "create_event": tools.create_event,
        "reschedule_event": (
            tools.reschedule_event
        ),
        "get_tasks": tools.get_tasks,
        "create_task": tools.create_task,
        "complete_task": tools.complete_task,
        "prepare_email": tools.prepare_email,
    }

    general_tools = {
        "draft_message": tools.draft_message,
        "get_weather": tools.get_weather,
        "search_web": tools.search_web,
        "get_hacker_news": (
            tools.get_hacker_news
        ),
        "set_focus_mode": (
            tools.set_focus_mode
        ),
        "scan_screen": tools.scan_screen,
    }

    if tool_name in user_tools:
        return user_tools[tool_name](
            user_id=user_id,
            **arguments,
        )

    if tool_name in general_tools:
        return general_tools[tool_name](
            **arguments
        )

    return {
        "status": "error",
        "message": f"Unknown tool: {tool_name}",
    }


def run_sub_agent(
    agent_key: str,
    request: str,
    user_id: str,
    conversation: list[dict],
) -> Generator[dict, None, dict]:
    """Run one agent and emit trace events."""
    config = AGENT_CONFIG[agent_key]
    agent_name = config["name"]

    yield {
        "agent": agent_name,
        "type": "thinking",
        "message": (
            f"{agent_name} is working on this."
        ),
        "timestamp": timestamp(),
    }

    history = format_conversation(
        conversation
    )

    agent_request = f"""
{current_context()}

Previous conversation:
{history}

Assignment:
{request}
"""

    generation_config = (
        types.GenerateContentConfig(
            system_instruction=config["prompt"],
            tools=[
                types.Tool(
                    function_declarations=(
                        config["tools"]
                    )
                )
            ],
        )
    )

    try:
        response = (
            get_client()
            .models
            .generate_content(
                model=MODEL,
                contents=agent_request,
                config=generation_config,
            )
        )
    except Exception as exc:
        result = {
            "agent": agent_name,
            "summary": (
                f"{agent_name} could not complete "
                f"the request: {exc}"
            ),
            "tool_results": [],
        }

        yield {
            "agent": agent_name,
            "type": "error",
            "message": result["summary"],
            "timestamp": timestamp(),
        }

        return result

    tool_results: list[dict] = []

    if response.candidates:
        parts = (
            response.candidates[0]
            .content
            .parts
            or []
        )

        for part in parts:
            function_call = getattr(
                part,
                "function_call",
                None,
            )

            if not function_call:
                continue

            tool_name = function_call.name
            arguments = dict(
                function_call.args or {}
            )

            yield {
                "agent": agent_name,
                "type": "tool_call",
                "message": (
                    f"Using {tool_name}."
                ),
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

            tool_results.append({
                "tool": tool_name,
                "result": tool_result,
            })

            yield {
                "agent": agent_name,
                "type": "tool_result",
                "message": (
                    humanize_tool_result(
                        tool_name,
                        tool_result,
                    )
                ),
                "tool": tool_name,
                "result": tool_result,
                "timestamp": timestamp(),
            }

    summary = summarize_agent_result(
        agent_name=agent_name,
        request=request,
        tool_results=tool_results,
        model_text=(
            response.text.strip()
            if response.text
            else ""
        ),
    )

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


def humanize_tool_result(
    tool_name: str,
    result: dict,
) -> str:
    """Create concise trace text without raw JSON."""
    if result.get("status") == "error":
        return result.get(
            "message",
            f"{tool_name} failed.",
        )

    if result.get("message"):
        return str(result["message"])

    if tool_name == "get_calendar_events":
        count = result.get("count", 0)

        return (
            f"Found {count} calendar "
            f"{'event' if count == 1 else 'events'}."
        )

    if tool_name == "get_tasks":
        count = result.get("count", 0)

        return (
            f"Found {count} "
            f"{'task' if count == 1 else 'tasks'}."
        )

    if tool_name == "get_weather":
        return (
            f"Forecast retrieved for "
            f"{result.get('location', 'the location')}."
        )

    if tool_name == "search_web":
        return (
            f"Found {result.get('count', 0)} "
            "research results."
        )

    if tool_name == "get_hacker_news":
        return (
            f"Found {result.get('count', 0)} "
            "Hacker News stories."
        )

    return f"{tool_name} completed."


def summarize_agent_result(
    agent_name: str,
    request: str,
    tool_results: list[dict],
    model_text: str,
) -> str:
    if model_text and not tool_results:
        return model_text

    if not tool_results:
        return (
            f"{agent_name} completed the request."
        )

    messages = []

    for item in tool_results:
        result = item["result"]

        if isinstance(result, dict):
            message = result.get("message")

            if message:
                messages.append(str(message))

    if messages:
        return " ".join(messages)

    tool_names = [
        item["tool"]
        for item in tool_results
    ]

    return (
        f"{agent_name} completed the request "
        f"using {', '.join(tool_names)}."
    )


def synthesize_final_answer(
    user_request: str,
    conversation: list[dict],
    results: list[dict],
) -> str:
    """
    Produce a natural chatbot response from tool results.

    This is the text displayed prominently in the UI.
    """
    compact_results = [
        {
            "agent": result["agent"],
            "summary": result["summary"],
            "tool_results": (
                result["tool_results"]
            ),
        }
        for result in results
    ]

    prompt = f"""
You are Sutra, a warm and concise AI chief of staff.

{current_context()}

The user said:
{user_request}

Recent conversation:
{format_conversation(conversation)}

Agent and tool results:
{json.dumps(compact_results, default=str, ensure_ascii=False)}

Write the final answer directly to the user.

Rules:
- Sound like a normal helpful chatbot.
- Do not mention internal tool names.
- Do not say "completed using".
- Do not expose JSON.
- Clearly summarize calendar times, weather, tasks,
  drafts, or research when available.
- If an email requires confirmation, clearly say it is
  prepared but has not been sent.
- Never claim an email was sent unless its result explicitly
  says status success and source gmail.
- Keep the response under 180 words unless more detail is
  necessary.
- Never claim a calendar event was created unless a
  create_event result explicitly has status success.
- Never claim an event was moved unless a reschedule_event
  result explicitly has status success.
- If only get_calendar_events was called, say that you checked
  the calendar but did not create or change anything.
"""

    try:
        response = (
            get_client()
            .models
            .generate_content(
                model=MODEL,
                contents=prompt,
            )
        )

        if response.text:
            return response.text.strip()

    except Exception as exc:
        print(
            f"Final synthesis failed: {exc}"
        )

    summaries = [
        result["summary"]
        for result in results
        if result.get("summary")
    ]

    if summaries:
        return " ".join(summaries)

    return (
        "I finished processing your request, "
        "but I do not have any results to show."
    )


def orchestrate_events(
    user_request: str,
    user_id: str = "vishwas",
    demo_mode: bool = False,
) -> Generator[dict, None, None]:
    """Yield orchestration events for SSE."""
    normalized_request = (
        user_request.strip().lower()
    )

    cache_key = (
        f"{user_id}:{normalized_request}"
    )

    token_estimate = estimate_tokens(
        user_request
    )

    if (
        demo_mode
        and cache_key in _response_cache
    ):
        cached = {
            **_response_cache[cache_key],
            "cached": True,
            "demo_mode": True,
        }

        for step in cached["trace"]:
            token_estimate += estimate_tokens(
                step
            )

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

    previous_conversation = (
        get_recent_conversation(
            user_id,
            turns=5,
        )
    )

    save_conversation_message(
        user_id=user_id,
        role="user",
        content=user_request,
    )

    trace: list[dict] = []
    results: list[dict] = []

    first_step = {
        "agent": "Orchestrator",
        "type": "thinking",
        "message": (
            "Understanding your request and "
            "selecting the right agents."
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

    plan = create_plan(
        user_request,
        previous_conversation,
    )

    agents_needed = plan.get(
        "agents_needed",
        [],
    )

    agent_names = [
        AGENT_CONFIG[agent]["name"]
        for agent in agents_needed
    ]

    plan_step = {
        "agent": "Orchestrator",
        "type": "plan",
        "message": (
            "Working with "
            + ", ".join(agent_names)
            + "."
        ),
        "agents": agent_names,
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
            conversation=previous_conversation,
        )

        while True:
            try:
                step = next(generator)
                trace.append(step)

                token_estimate += (
                    estimate_tokens(step)
                )

                yield {
                    "event": "trace",
                    "data": step,
                    "token_count": token_estimate,
                }

            except StopIteration as finished:
                if finished.value:
                    results.append(
                        finished.value
                    )

                break

    request_type = (
        agents_needed[0]
        if agents_needed
        else "unknown"
    )

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

        token_estimate += estimate_tokens(
            insight_step
        )

        yield {
            "event": "trace",
            "data": insight_step,
            "token_count": token_estimate,
        }

    final_answer = synthesize_final_answer(
        user_request=user_request,
        conversation=previous_conversation,
        results=results,
    )

    save_conversation_message(
        user_id=user_id,
        role="assistant",
        content=final_answer,
    )

    final_step = {
        "agent": "Orchestrator",
        "type": "final",
        "message": final_answer,
        "timestamp": timestamp(),
    }

    trace.append(final_step)

    token_estimate += estimate_tokens(
        final_step
    )

    yield {
        "event": "trace",
        "data": final_step,
        "token_count": token_estimate,
    }

    result = {
        "user_request": user_request,
        "final_message": final_answer,
        "plan": plan,
        "results": results,
        "trace": trace,
        "insight": insight,
        "token_count": token_estimate,
        "cached": False,
        "demo_mode": demo_mode,
    }

    if demo_mode:
        _response_cache[cache_key] = result

    yield {
        "event": "complete",
        "data": result,
        "token_count": token_estimate,
        "cached": False,
    }


def orchestrate(
    user_request: str,
    user_id: str = "vishwas",
    demo_mode: bool = False,
) -> dict:
    """Compatibility wrapper returning complete JSON."""
    final_result = None

    for event in orchestrate_events(
        user_request=user_request,
        user_id=user_id,
        demo_mode=demo_mode,
    ):
        if event["event"] == "complete":
            final_result = event["data"]

    if final_result is None:
        raise RuntimeError(
            "Orchestration ended without a result"
        )

    return final_result


if __name__ == "__main__":
    init_db()

    prompt = (
        "Check tomorrow's weather in Bengaluru "
        "and show my calendar."
    )

    for stream_event in orchestrate_events(
        prompt
    ):
        print(
            json.dumps(
                stream_event,
                indent=2,
                default=str,
                ensure_ascii=False,
            )
        )