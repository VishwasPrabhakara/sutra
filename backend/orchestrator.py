"""
Sutra Orchestrator — coordinates 6 sub-agents:
Scheduler, TaskAgent, Scribe, WeatherAgent, RoutineAgent, ScreenAgent, + Learner
"""
import os
import json
from datetime import datetime
from dotenv import load_dotenv
from google import genai
from google.genai import types

import tools
from db import init_db, log_request, get_pattern_insight

load_dotenv()

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY"),
    http_options=types.HttpOptions(timeout=60_000),
)
MODEL = "gemini-flash-latest"

# ============ RESPONSE CACHE ============
_response_cache: dict[str, dict] = {}


# ============ TOOL DECLARATIONS for Gemini function calling ============

CALENDAR_TOOLS = [
    {
        "name": "get_calendar_events",
        "description": "Get the user's upcoming calendar events.",
        "parameters": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "Optional date filter YYYY-MM-DD"}
            },
        },
    },
    {
        "name": "reschedule_event",
        "description": "Move an existing calendar event to a new time.",
        "parameters": {
            "type": "object",
            "properties": {
                "event_title": {"type": "string"},
                "new_start_time": {"type": "string", "description": "Format: YYYY-MM-DD HH:MM"},
            },
            "required": ["event_title", "new_start_time"],
        },
    },
]

TASK_TOOLS = [
    {
        "name": "get_tasks",
        "description": "Get the user's task list.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "create_task",
        "description": "Add a new task.",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "priority": {"type": "string", "enum": ["low", "medium", "high"]},
            },
            "required": ["title"],
        },
    },
]

SCRIBE_TOOLS = [
    {
        "name": "draft_message",
        "description": "Draft a message or email to someone.",
        "parameters": {
            "type": "object",
            "properties": {
                "recipient": {"type": "string"},
                "topic": {"type": "string"},
                "context": {"type": "string"},
            },
            "required": ["recipient", "topic"],
        },
    },
]

WEATHER_TOOLS = [
    {
        "name": "get_weather",
        "description": "Get weather forecast for a location and date.",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string"},
                "date": {"type": "string", "description": "e.g. 'tomorrow', 'Friday'"},
            },
        },
    },
]

ROUTINE_TOOLS = [
    {
        "name": "set_focus_mode",
        "description": "Activate or deactivate Focus Mode (DND) for deep work.",
        "parameters": {
            "type": "object",
            "properties": {
                "active": {"type": "boolean"},
                "duration_minutes": {"type": "integer"},
                "reason": {"type": "string"},
            },
            "required": ["active"],
        },
    },
]

SCREEN_TOOLS = [
    {
        "name": "scan_screen",
        "description": "Scan screen/messaging app for schedule updates and action items.",
        "parameters": {
            "type": "object",
            "properties": {
                "source": {
                    "type": "string",
                    "enum": ["whatsapp", "slack", "email"],
                    "description": "Which app to scan",
                }
            },
        },
    },
]


TOOL_IMPL = {
    "get_calendar_events": tools.get_calendar_events,
    "reschedule_event": tools.reschedule_event,
    "get_tasks": tools.get_tasks,
    "create_task": tools.create_task,
    "draft_message": tools.draft_message,
    "get_weather": tools.get_weather,
    "set_focus_mode": tools.set_focus_mode,
    "scan_screen": tools.scan_screen,
}


def run_sub_agent(agent_name: str, system_prompt: str, user_request: str, tool_decls: list, trace: list):
    trace.append({
        "agent": agent_name,
        "type": "thinking",
        "message": f"{agent_name} activated, analyzing request…",
        "timestamp": datetime.now().isoformat(),
    })

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        tools=[types.Tool(function_declarations=tool_decls)],
    )

    response = client.models.generate_content(
        model=MODEL,
        contents=user_request,
        config=config,
    )

    tool_results = []
    if response.candidates and response.candidates[0].content.parts:
        for part in response.candidates[0].content.parts:
            if hasattr(part, "function_call") and part.function_call:
                fn_name = part.function_call.name
                fn_args = dict(part.function_call.args) if part.function_call.args else {}

                trace.append({
                    "agent": agent_name,
                    "type": "tool_call",
                    "message": f"Calling tool: {fn_name}",
                    "tool": fn_name,
                    "args": fn_args,
                    "timestamp": datetime.now().isoformat(),
                })

                if fn_name in TOOL_IMPL:
                    result = TOOL_IMPL[fn_name](**fn_args)
                    tool_results.append({"tool": fn_name, "result": result})

                    trace.append({
                        "agent": agent_name,
                        "type": "tool_result",
                        "message": f"Tool {fn_name} returned successfully",
                        "result": result,
                        "timestamp": datetime.now().isoformat(),
                    })

    summary_text = response.text if response.text else ""

    trace.append({
        "agent": agent_name,
        "type": "complete",
        "message": summary_text or f"{agent_name} finished its work.",
        "timestamp": datetime.now().isoformat(),
    })

    return {"agent": agent_name, "summary": summary_text, "tool_results": tool_results}


def orchestrate(user_request: str, user_id: str = "vishwas") -> dict:
    # Cache check
    cache_key = user_request.strip().lower()
    if cache_key in _response_cache:
        print(f"✅ Cache hit: {user_request[:50]}")
        cached = _response_cache[cache_key]
        try:
            agents = cached.get("plan", {}).get("agents_needed", [])
            log_request(user_id, user_request, agents[0] if agents else "unknown")
        except Exception:
            pass
        return cached

    trace = []

    trace.append({
        "agent": "Orchestrator",
        "type": "thinking",
        "message": "Decomposing your request and identifying which sub-agents to dispatch…",
        "timestamp": datetime.now().isoformat(),
    })

    decompose_prompt = f"""You are Sutra's main Orchestrator agent. Analyze the user request and decide which sub-agents to invoke.

Available sub-agents:
- "scheduler" — calendar, time conflicts, rescheduling, availability checks
- "scribe" — drafts messages, emails, summaries
- "tasks" — manages to-do items, task creation, completion
- "weather" — weather forecasts (use when user mentions outdoor plans, travel, rain)
- "routine" — focus mode, DND, deep work sessions, notification control
- "screen" — scans WhatsApp/Slack/email for schedule updates and action items

Respond ONLY with a JSON object in this exact format (no markdown, no explanation):
{{
  "agents_needed": ["scheduler", "screen"],
  "scheduler_request": "what scheduler should do",
  "scribe_request": "what scribe should do",
  "tasks_request": "what tasks agent should do",
  "weather_request": "what weather agent should do",
  "routine_request": "what routine agent should do",
  "screen_request": "what source to scan (whatsapp, slack, or email)"
}}

Only include keys for agents you're activating. User request: {user_request}"""

    plan_response = client.models.generate_content(
        model=MODEL,
        contents=decompose_prompt,
    )

    plan_text = plan_response.text.strip()
    if plan_text.startswith("```"):
        plan_text = plan_text.split("```")[1]
        if plan_text.startswith("json"):
            plan_text = plan_text[4:]
    plan_text = plan_text.strip()

    try:
        plan = json.loads(plan_text)
    except json.JSONDecodeError:
        plan = {"agents_needed": ["scheduler"], "scheduler_request": user_request}

    agents_needed = plan.get("agents_needed", [])
    trace.append({
        "agent": "Orchestrator",
        "type": "plan",
        "message": f"Plan ready. Dispatching to: {', '.join(agents_needed)}",
        "agents": agents_needed,
        "timestamp": datetime.now().isoformat(),
    })

    results = []

    if "scheduler" in agents_needed:
        results.append(run_sub_agent(
            agent_name="Scheduler",
            system_prompt="You manage calendars and resolve time conflicts. Always check the calendar before suggesting changes. Be concise.",
            user_request=plan.get("scheduler_request", user_request),
            tool_decls=CALENDAR_TOOLS,
            trace=trace,
        ))

    if "tasks" in agents_needed:
        results.append(run_sub_agent(
            agent_name="TaskAgent",
            system_prompt="You manage to-do items. Create or fetch tasks as needed. Be concise.",
            user_request=plan.get("tasks_request", user_request),
            tool_decls=TASK_TOOLS,
            trace=trace,
        ))

    if "scribe" in agents_needed:
        results.append(run_sub_agent(
            agent_name="Scribe",
            system_prompt="You draft clear, professional messages. Be warm but concise.",
            user_request=plan.get("scribe_request", user_request),
            tool_decls=SCRIBE_TOOLS,
            trace=trace,
        ))

    if "weather" in agents_needed:
        results.append(run_sub_agent(
            agent_name="WeatherAgent",
            system_prompt="You fetch weather forecasts and give practical advice based on the conditions. Be concise.",
            user_request=plan.get("weather_request", user_request),
            tool_decls=WEATHER_TOOLS,
            trace=trace,
        ))

    if "routine" in agents_needed:
        results.append(run_sub_agent(
            agent_name="RoutineAgent",
            system_prompt="You manage focus mode, DND, and deep work sessions. When activating focus mode, set a reasonable duration and reason.",
            user_request=plan.get("routine_request", user_request),
            tool_decls=ROUTINE_TOOLS,
            trace=trace,
        ))

    if "screen" in agents_needed:
        results.append(run_sub_agent(
            agent_name="ScreenAgent",
            system_prompt="You scan messaging apps for schedule updates and action items. Identify the source (whatsapp/slack/email) and report what you find clearly.",
            user_request=plan.get("screen_request", user_request),
            tool_decls=SCREEN_TOOLS,
            trace=trace,
        ))

    # Learner: proactive insight from SQL patterns
    log_request(user_id, user_request, agents_needed[0] if agents_needed else "unknown")
    insight = get_pattern_insight(user_id)
    if insight:
        trace.append({
            "agent": "Learner",
            "type": "insight",
            "message": insight,
            "timestamp": datetime.now().isoformat(),
        })

    final_summary = "Here's what I did: " + " | ".join(
        [r["summary"] or f"{r['agent']} completed" for r in results]
    )

    trace.append({
        "agent": "Orchestrator",
        "type": "final",
        "message": final_summary,
        "timestamp": datetime.now().isoformat(),
    })

    result = {
        "user_request": user_request,
        "plan": plan,
        "results": results,
        "trace": trace,
        "insight": insight,
    }

    _response_cache[cache_key] = result
    return result


if __name__ == "__main__":
    init_db()
    print("\n" + "=" * 60)
    print("SUTRA — 6-Agent Chief of Staff")
    print("=" * 60 + "\n")
    test = "Check my WhatsApp for schedule updates and reschedule anything that changed."
    print(f"📥 {test}\n")
    result = orchestrate(test)
    print("\n--- TRACE ---")
    for step in result["trace"]:
        print(f"[{step['agent']}] {step['message']}")
    print("\n--- DONE ---\n")