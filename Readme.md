# 🧠 Sutra — Multi-Agent AI Chief of Staff

> A six-agent AI orchestration system that coordinates specialized sub-agents to handle real-world workflows. Built for the Gen AI Hackathon APAC 2026.

**Live Demo:** [https://sutra-frontend-381066349460.us-central1.run.app/](https://sutra-frontend-381066349460.us-central1.run.app/)

**API:** [https://sutra-backend-381066349460.us-central1.run.app/docs](https://sutra-backend-381066349460.us-central1.run.app/docs)

**Video Demo:** https://youtu.be/qIlKeeLJnE4?si=YJL3NRUK1LKiRnLP

---

## What is Sutra?

*Sutra* (Sanskrit: "thread") is a multi-agent AI system that threads together specialized agents, MCP tools, and persistent data to handle complex real-world workflows. It doesn't just answer questions — it coordinates a team of agents to actually get things done, and visualizes every step in real time.

Built solo in one day for the Gen AI Hackathon APAC.

---

## 🎯 Core Features

- **Multi-agent orchestration** — A primary Orchestrator agent decomposes user requests and dispatches specialized sub-agents in parallel
- **6 specialized agents** — Scheduler, TaskAgent, Scribe, WeatherAgent, RoutineAgent, ScreenAgent
- **Self-improving Learner** — A 7th agent that runs SQL pattern detection across past requests and proactively suggests improvements
- **MCP-compatible tools** — Calendar, tasks, notes, weather, focus mode, and screen scan tools exposed via Gemini function calling
- **SQLite persistence** — All requests, events, tasks, and patterns stored in a real database
- **Live trace visualization** — Watch every agent decision and tool call in real time
- **Voice input** — Hinglish-aware speech recognition via Web Speech API (Chrome/Edge)
- **API-deployed** — FastAPI backend on Google Cloud Run, React frontend on Cloud Run

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend (React + Vite + Tailwind)             │
│  Deployed on Google Cloud Run                   │
│  4 screens: Orchestrate, Schedule, Logs,        │
│             Knowledge                           │
└────────────────┬────────────────────────────────┘
                 │ HTTP / JSON
┌────────────────▼────────────────────────────────┐
│  FastAPI Backend                                │
│  Deployed on Google Cloud Run                   │
│  /orchestrate, /api/events, /api/tasks,         │
│  /api/history, /api/insights                    │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│  Orchestrator (Gemini Flash)                    │
│  Decomposes request, dispatches to sub-agents   │
└─┬────┬────┬────┬────┬────┬────┬─────────────────┘
  │    │    │    │    │    │    │
  ▼    ▼    ▼    ▼    ▼    ▼    ▼
  Sch  Task Scrb Wthr Rout Scrn Lrnr
  ↓    ↓    ↓    ↓    ↓    ↓    ↓
  ┌───────────────────────────────────┐
  │  MCP-compatible tool layer         │
  │  (8 callable functions)            │
  └────────────┬───────────────────────┘
               │
       ┌───────▼────────┐
       │ SQLite (3      │
       │ tables: events,│
       │ tasks, history)│
       └────────────────┘
```

---

## 🤖 The Agents

| Agent | Role | Tools |
|---|---|---|
| **Orchestrator** | Decomposes requests, dispatches sub-agents | (planning only) |
| **Scheduler** | Manages calendar, resolves conflicts, reschedules events | `get_calendar_events`, `reschedule_event` |
| **TaskAgent** | Handles to-do items and task management | `get_tasks`, `create_task` |
| **Scribe** | Drafts messages, emails, summaries | `draft_message` |
| **WeatherAgent** | Fetches forecasts and gives practical advice | `get_weather` |
| **RoutineAgent** | Manages focus mode, DND, deep work sessions | `set_focus_mode` |
| **ScreenAgent** | Scans messaging apps for schedule updates (mocked WhatsApp/Slack/Email integration) | `scan_screen` |
| **Learner** | Runs SQL pattern detection across `request_history`, surfaces proactive insights | (SQL queries, no Gemini call) |

---

## 🛠️ Tech Stack

**Backend**
- Python 3.11
- FastAPI + Uvicorn
- Google Gemini API (`google-genai` SDK) with function calling
- SQLite (via `sqlite3` stdlib)
- Pydantic for request validation
- Deployed on **Google Cloud Run**

**Frontend**
- React 18 + TypeScript
- Vite
- Tailwind CSS v3
- Lucide React (icons)
- Web Speech API (voice input)
- Deployed on **Google Cloud Run** (nginx static serving)

---

## 🚀 Run Locally

### Prerequisites
- Python 3.11+
- Node.js 20+
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
echo "GEMINI_API_KEY=your_key_here" > .env
uvicorn main:app --reload --port 8000
```

Backend will be live at `http://127.0.0.1:8000`. Try `http://127.0.0.1:8000/docs` for the interactive API.

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend will be live at `http://localhost:5173`.

---

## 📋 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Service info + agent list |
| `GET` | `/health` | Health check + cache status |
| `POST` | `/orchestrate` | Main agent dispatch endpoint |
| `GET` | `/api/events` | Calendar events from DB |
| `GET` | `/api/tasks` | Task list from DB |
| `GET` | `/api/history` | Request history (fuels the Learner) |
| `GET` | `/api/insights` | Learner's discovered patterns |

Example:
```bash
curl -X POST https://sutra-backend-381066349460.us-central1.run.app/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"request": "What is on my calendar this week?"}'
```

---

## 🎨 Demo Prompts

The Orchestrate screen ships with 6 cached demo prompts to showcase different agent combinations:

1. **🇮🇳 Hinglish** — multi-agent scheduling with Indian context
2. **📅 Calendar** — Scheduler + TaskAgent collaboration
3. **📨 Multi-tool** — Scribe + TaskAgent collaboration
4. **🌤️ Weather** — WeatherAgent + Scheduler conditional flow
5. **🔕 Focus mode** — RoutineAgent (DND activation)
6. **📱 Screen Scan** — ScreenAgent + cascade to Scheduler

---

## 🧠 How the Learner Works

The "self-improving" wow factor isn't a black-box ML model — it's deterministic SQL aggregation. After every request:

1. The request is logged to `request_history` (user_id, request_text, request_type, timestamp)
2. The Learner queries the database to detect patterns:
   - High frequency of a specific request type (e.g., "user reschedules sprint demos repeatedly")
   - Weekly volume thresholds
3. When a threshold is hit, the Learner injects a proactive insight into the next response
4. The frontend displays it as a glowing yellow banner

This is hybrid AI — deterministic pattern detection feeding into the LLM as context. It's reliable, explainable, and works even when Gemini is rate-limited.

---

## 🗺️ Roadmap

If we had more than one day:
- Real WhatsApp Business API integration (currently mocked in `ScreenAgent`)
- Real OpenWeatherMap integration (currently mocked in `WeatherAgent`)
- Real Google Calendar MCP server (currently SQLite mock)
- Migrate from SQLite → AlloyDB for production
- Replace deterministic Learner with a fine-tuned classifier
- Voice OUTPUT (Sutra speaks back) via TTS
- Multi-user support with auth

---

## 📝 Problem Statement

> Build a multi-agent AI system that helps users manage tasks, schedules, and information by interacting with multiple tools and data sources.
>
> **Core Requirements:**
> - Implement a primary agent coordinating one or more sub-agents ✅
> - Store and retrieve structured data from a database ✅
> - Integrate multiple tools via MCP (e.g., calendar, task manager, notes) ✅
> - Handle multi-step workflows and task execution ✅
> - Deploy as an API-based system ✅

All five requirements satisfied. See architecture diagram above for how each is met.

---

## 👤 Built By

**Team Hardballer**

**Vishwas P** , **Srimathi R** , **Mahadev Aralikatti** & **Sumanyu Seth** — 
 for Gen AI Academy APAC edition Hackathon 2026.

Built with ❤️, Gemini Flash, and a lot of caffeine.

---

## 📄 License

MIT
