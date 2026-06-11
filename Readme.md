# 🧠 Sutra — Multi-Agent AI Chief of Staff

> Sanskrit for *"thread."* Sutra threads together specialized AI agents, real-world tools, and persistent memory to handle messy multi-step requests — and shows you every decision in real time as it happens.

<p align="center">
  <a href="https://sutra-frontend-381066349460.us-central1.run.app"><b>🌐 Live Demo</b></a> ·
  <a href="https://youtu.be/qIlKeeLJnE4?si=YJL3NRUK1LKiRnLP"><b>🎥 Video Demo</b></a> ·
  <a href="https://sutra-backend-381066349460.us-central1.run.app/docs"><b>📘 API Docs</b></a>
</p>

Built for the **Google Cloud Gen AI Academy APAC Hackathon 2026**.

![Sutra UI](https://github.com/VishwasPrabhakara/sutra/raw/main/screenshot_of_UI.png)

---

## What makes Sutra different

Most multi-agent demos are black boxes — type a prompt, wait, see a response. Sutra is built so you can **watch every agent fire**, see the tools they call, and the data they return — **in real time** — while keeping a human in the loop for anything that touches the outside world.

Four things make this real, not a demo:

1. **True Server-Sent Events streaming** — every agent thought, tool call, and tool result is pushed to the UI as it happens. No fake `setTimeout` animations.
2. **Real working tools with OAuth** — Google Calendar read/create, Gmail send (after confirmation), Open-Meteo weather, DuckDuckGo search, Hacker News.
3. **Human-in-the-loop confirmation** — anything that creates a calendar event or sends an email is *prepared*, not executed. The user sees a confirmation card and approves or cancels before the action fires.
4. **Multi-turn conversation memory** — Sutra remembers the last several exchanges per user, so follow-ups like *"reschedule that to tomorrow"* work without restating context.

Try prompts like:

- *"Friday meri sprint demo hai but mom is flying in from Chennai. Sort it out."*
- *"What's on my calendar this week and what tasks do I have pending?"*
- *"Draft a message to Marcus about the Q4 deck and add it to my tasks."*
- *"I have an outdoor team offsite tomorrow, check the weather and reschedule if needed."*

The **Orchestrator** decomposes the request, decides which sub-agents to dispatch, and stitches their outputs into one coherent response.

---

## 🏗️ Architecture

![Sutra Architecture](https://github.com/VishwasPrabhakara/sutra/raw/main/architecture.svg)

---

## 🤖 The Agents

| Agent | Role | Tools |
|-------|------|-------|
| **Orchestrator** | Decomposes requests, plans agent dispatch, synthesizes the final response, manages conversation memory | — |
| **Scheduler** | Calendar lookups, creating events, conflict detection, rescheduling | `get_calendar_events`, `create_event`, `reschedule_event` |
| **TaskAgent** | Manages to-do items | `get_tasks`, `create_task` |
| **Scribe** | Drafts messages and prepares emails for sending | `draft_message`, `prepare_email` |
| **WeatherAgent** | Real Open-Meteo forecasts + practical advice | `get_weather` |
| **ResearchAgent** | Web search and tech news | `search_web`, `get_hacker_news` |
| **Learner** | SQL pattern detection across past requests — surfaces proactive insights | — *(reads `request_history`)* |

Every sub-agent uses **Gemini function calling**. The Learner runs after orchestration completes, reads `request_history` from SQLite, and pushes pattern-based hints back into the response.

---

## 🛡️ Human-in-the-Loop Confirmation Flow

Sutra never sends an email or creates a calendar event silently. Destructive or outbound actions follow a two-phase pattern:

1. **Prepare phase** — the agent calls `prepare_email` (or `create_event`). The action is staged with a unique `action_id`, persisted to SQLite, and surfaced in the UI as a confirmation card.
2. **Confirm phase** — the user reviews the prepared action and either:
   - `POST /api/actions/{action_id}/confirm` → action executes (Gmail send, Calendar insert)
   - `POST /api/actions/{action_id}/cancel` → action discarded

This means even if the LLM hallucinates a recipient or misreads a request, nothing leaves the system without the user explicitly approving it. Useful for the demo; necessary for anything resembling production.

---

## 🔬 What's implemented

Hackathon projects often blur this. Sutra is explicit:

| Capability | Status |
|------------|--------|
| Multi-agent orchestration with Gemini function calling | ✅ Real |
| Server-Sent Events streaming (per-step trace) | ✅ Real |
| Multi-turn conversation memory (per-user) | ✅ Real (SQLite) |
| Google Calendar — read events via OAuth 2.0 | ✅ Real |
| Google Calendar — create events with user confirmation | ✅ Real |
| Gmail — send emails with user confirmation | ✅ Real |
| Open-Meteo weather forecasts | ✅ Real (free public API) |
| DuckDuckGo Instant Answer | ✅ Real |
| Hacker News top stories | ✅ Real (Firebase public API) |
| Tasks + local calendar storage | ✅ Real (SQLite) |
| Request history + Learner pattern detection | ✅ Real (SQLite) |
| Demo prompt cache (Cloud Run cold start) | ✅ Real (pre-warm at startup) |

---

## ⚡ Features

- **True SSE streaming** — every agent step pushed as it happens
- **Animated agent network visualization** — Orchestrator → sub-agents with pulsing edges
- **Confirmation cards** for outbound actions (email, calendar create)
- **Multi-turn conversation memory** — follow-ups without restating context
- **Live token-usage meter** — estimated cost per request
- **Google Calendar + Gmail OAuth** — connect/disconnect from the sidebar
- **Demo prompt cache** — instant response on cold start for showcased flows
- **Hinglish voice input** (en-IN) via Web Speech API
- **Persistent memory** — tasks, calendar, history, learner patterns, OAuth tokens
- **Compact agent trace** — one row per agent, click to expand sub-events
- **Typed tool-result rendering** — calendar chips, weather cards, HN link lists; raw JSON hidden behind a toggle

---

## 🛠️ Tech Stack

**Backend**
- **FastAPI** — async REST API with Server-Sent Events endpoint
- **google-genai** — Gemini SDK, model `gemini-flash-latest`
- **google-auth-oauthlib + google-api-python-client** — Google OAuth (Calendar + Gmail scopes)
- **httpx + requests** — real-tool HTTP clients
- **SQLite** — sessions, OAuth tokens, calendar, tasks, request history, conversation messages, prepared actions
- **Python 3.11**

**Frontend**
- **React 19 + TypeScript** + **Vite** + **Tailwind CSS**
- **lucide-react** — icon library
- **Web Speech API** — voice input (Chrome/Edge)
- 4 screens: **Orchestrate**, **Schedule**, **Logs**, **Knowledge**
- Custom components: `AgentNetworkGraph`, `TokenMeter`, `ConnectCalendar`, `ChatResponse`, `CompactTrace`

**Infrastructure**
- **Google Cloud Run** — backend and frontend, serverless, auto-scaling
- **Docker** — `python:3.11-slim` base for backend, nginx for frontend
- **Cloud Build + Artifact Registry** — CI/CD

---

## 🔌 API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Service info + active agents |
| `GET` | `/health` | Health check + cache size |
| `POST` | `/orchestrate` | Run a full multi-agent request (blocking) |
| `POST` | `/orchestrate/stream` | **Stream agent execution via Server-Sent Events** |
| `GET` | `/api/conversation` | Recent conversation history (multi-turn context) |
| `GET` | `/api/actions/{action_id}` | Get a prepared action (for confirmation UI) |
| `POST` | `/api/actions/{action_id}/confirm` | **Execute** a prepared action (send email, create event) |
| `POST` | `/api/actions/{action_id}/cancel` | **Cancel** a prepared action without executing |
| `GET` | `/api/events` | Calendar events (Schedule screen) |
| `GET` | `/api/tasks` | Pending tasks |
| `GET` | `/api/history` | Recent request history (Logs screen) |
| `GET` | `/api/insights` | Learner patterns (Knowledge screen) |
| `GET` | `/auth/login` | Start Google OAuth (Calendar + Gmail scopes) |
| `GET` | `/auth/callback` | Complete OAuth |
| `GET` | `/auth/status` | Check Google connection |
| `POST` | `/auth/disconnect` | Disconnect Google account |

---

## 🚀 Run Locally

### Prerequisites
- Python 3.11+
- Node 18+
- Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
- *(For Calendar + Gmail)* Google Cloud OAuth client credentials with `calendar.readonly`, `calendar.events`, and `gmail.send` scopes

### Backend

```bash
cd backend
pip install -r requirements.txt

cat > .env << 'EOF'
GEMINI_API_KEY=your_key_here
GOOGLE_OAUTH_CLIENT_ID=your_oauth_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_oauth_secret
OAUTH_REDIRECT_URI=http://localhost:8000/auth/callback
SESSION_SECRET=any_random_string
EOF

uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install

echo "VITE_API_BASE=http://localhost:8000" > .env

npm run dev
```

Open `http://localhost:5173`.

---

## 🐳 Deploy to Cloud Run

```bash
# Backend
cd backend
gcloud run deploy sutra-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --set-env-vars GEMINI_API_KEY=...,GOOGLE_OAUTH_CLIENT_ID=...,GOOGLE_OAUTH_CLIENT_SECRET=...,OAUTH_REDIRECT_URI=https://sutra-backend-XXX.run.app/auth/callback,SESSION_SECRET=...

# Frontend (after backend URL is known)
cd ../frontend
echo "VITE_API_BASE=https://sutra-backend-XXX.run.app" > .env
npm run build
gcloud run deploy sutra-frontend --source . --region us-central1 --allow-unauthenticated
```

---

## 📁 Project Structure

```
sutra/
├── backend/
│   ├── main.py              # FastAPI app + SSE endpoint + auth + action confirmation + cache pre-warming
│   ├── orchestrator.py      # Orchestrator + 5 tool-using sub-agents + Learner + conversation memory
│   ├── tools.py             # Real tools: Open-Meteo, DuckDuckGo, Hacker News, Calendar, Gmail; SQLite for tasks
│   ├── auth.py              # Google OAuth 2.0 flow (Calendar + Gmail scopes)
│   ├── calendar_service.py  # Google Calendar API wrapper (list, insert, patch)
│   ├── gmail_service.py     # Gmail API wrapper (confirmed-send only)
│   ├── db.py                # SQLite schema (sessions, oauth_tokens, calendar, tasks, history,
│   │                        #               conversation_messages, prepared_actions, patterns)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── sutra.db
├── frontend/
│   ├── src/
│   │   ├── screens/         # Orchestrate · Schedule · Logs · Knowledge
│   │   ├── components/      # AgentNetworkGraph · TokenMeter · ConnectCalendar
│   │   │                    # ChatResponse · CompactTrace · TopBar · BottomNav
│   │   ├── api.ts           # Backend client + SSE stream parser
│   │   └── App.tsx
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── architecture.svg
└── README.md
```

---

## 💡 How It Works

1. **User sends a query** via the React frontend (voice or text)
2. **Frontend opens SSE stream** to `POST /orchestrate/stream`
3. **Response cache** check — pre-warmed demo prompts return instantly
4. **Orchestrator** pulls the last few turns from `conversation_messages` and asks Gemini for a JSON plan: which sub-agents to dispatch and what each should do
5. **Plan event** streams to the frontend → agents light up in the network graph
6. **Each selected sub-agent** runs with its own system prompt and tool declarations
7. **Gemini decides which tools to call** — each `thinking`, `tool_call`, and `tool_result` streams as it happens
8. **Tools execute** against real APIs (Open-Meteo, DuckDuckGo, Hacker News, Google Calendar) or SQLite (tasks) — or, for outbound actions (Gmail send, Calendar create), **stage a prepared action** instead of executing immediately
9. **Frontend renders a confirmation card** for any prepared action; user clicks Confirm → `POST /api/actions/{id}/confirm` → Gmail/Calendar API fires for real
10. **Learner** logs the request to `request_history` and surfaces a pattern-based insight if one is detected
11. **Orchestrator** synthesizes a final summary, saves the turn to `conversation_messages`, and emits the `complete` event with the full structured response

The frontend renders the response as a chatbot bubble with typed cards per tool — no raw JSON dump.

---

## 🗺️ Roadmap

- **Voice output (TTS)** — speech synthesis for the final response
- **Multi-account OAuth** — connect a work Google + a personal Google simultaneously
- **Drag-to-reschedule** in the Schedule screen with conflict re-detection

---

## 📝 Built For

Google Cloud Gen AI Academy APAC Edition Hackathon 2026

**Built by:** [Vishwas Prabhakara](https://github.com/VishwasPrabhakara) — ML Engineer @ IISc Centre for Sustainable Technologies

[LinkedIn](https://www.linkedin.com/in/vishwas-prabhakara-2050821b6/) · vp14032001@gmail.com

**Related projects:**
- [PaperLens](https://github.com/VishwasPrabhakara/Chat_with_PDF) — Hybrid RAG over PDFs
- [DataLens](https://github.com/VishwasPrabhakara/datalens) — Chat with any database
- [MatchLens](https://github.com/VishwasPrabhakara/matchlens) — Resume ↔ JD matcher with embedding drift detection

---

## 📄 License

MIT
