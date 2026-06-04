# 🧠 Sutra — Multi-Agent AI Chief of Staff

> Sanskrit for "thread." A multi-agent AI system that threads together specialized agents, tools, and persistent memory to handle real-world workflows — and visualizes every decision in real time.

**Live Demo:** https://sutra-frontend-381066349460.us-central1.run.app <br />
**Vedio Demo** https://www.youtube.com/watch?si=YJL3NRUK1LKiRnLP&v=qIlKeeLJnE4&feature=youtu.be <br/>
**API Docs:** https://sutra-backend-381066349460.us-central1.run.app/docs

Built solo for the **Google Cloud Gen AI Academy APAC Hackathon 2026**.

![Sutra UI](https://github.com/VishwasPrabhakara/sutra/blob/main/screenshot_of_UI.png)
---

## What is Sutra?

Sutra doesn't just answer questions. It coordinates a team of specialized agents to actually get things done — reschedule meetings, draft messages, manage tasks, check weather, scan messages, activate focus mode — and shows you exactly which agents fired, which tools they called, and what they returned.

Try prompts like:
- *"Friday meri sprint demo hai but mom is flying in from chennai. sort it out."*
- *"What's on my calendar this week and what tasks do I have pending?"*
- *"Draft a message to Marcus about the Q4 deck and add it to my tasks."*
- *"I have an outdoor team offsite tomorrow, check the weather and reschedule if needed."*
- *"Check my WhatsApp for any schedule updates and update my calendar."*

A primary **Orchestrator** decomposes the request, decides which sub-agents to dispatch, and stitches their outputs into one coherent response.

---

## 🏗️ Architecture

![Sutra Architecture](https://github.com/VishwasPrabhakara/sutra/raw/main/architecture.svg)

---

## 🤖 The Agents

| Agent | Role | Tools |
|-------|------|-------|
| **Orchestrator** | Decomposes requests, plans agent dispatch, synthesizes the final response | — |
| **Scheduler** | Calendar lookups, conflict detection, rescheduling | `get_calendar_events`, `reschedule_event` |
| **TaskAgent** | Manages to-do items | `get_tasks`, `create_task` |
| **Scribe** | Drafts messages and emails | `draft_message` |
| **WeatherAgent** | Forecasts + practical advice for outdoor plans | `get_weather` |
| **RoutineAgent** | Focus mode / DND / deep work sessions | `set_focus_mode` |
| **ScreenAgent** | Scans WhatsApp / Slack / email for schedule changes and action items | `scan_screen` |
| **Learner** | SQL pattern detection across past requests — surfaces proactive insights | — |

Every sub-agent uses **Gemini function calling**. The Learner reads `request_history` from SQLite and pushes pattern-based hints back into the response.

---

## 🛠️ Tech Stack

**Backend**
- **FastAPI** (`fastapi==0.135.3`) — async REST API
- **google-genai** (`1.70.0`) — Gemini SDK, model `gemini-flash-latest`
- **SQLite** — sessions, calendar, tasks, request history
- **Response cache** — pre-warms demo prompts on Cloud Run startup
- **Python 3.11**

**Frontend**
- **React 19 + TypeScript** — chat UI + 4 screens (Orchestrate, Schedule, Logs, Knowledge)
- **Vite** + **Tailwind CSS** — build and styling
- **lucide-react** — icons
- **Web Speech API** — Hinglish-aware voice input (Chrome/Edge)

**Infrastructure**
- **Google Cloud Run** — both backend and frontend, serverless, auto-scaling
- **Docker** — `python:3.11-slim` base for backend
- **Cloud Build + Artifact Registry** — CI/CD

---

## 🔌 API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Service info + active agents |
| `GET` | `/health` | Health check + cache size |
| `POST` | `/orchestrate` | Run a full multi-agent request |
| `GET` | `/api/events` | Calendar events (Schedule screen) |
| `GET` | `/api/tasks` | Pending tasks |
| `GET` | `/api/history` | Recent request history (Logs screen) |
| `GET` | `/api/insights` | Learner patterns (Knowledge screen) |

---

## 🚀 Run Locally

### Prerequisites
- Python 3.11+, Node 18+
- Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

### Backend
```bash
cd backend
pip install -r requirements.txt
echo "GEMINI_API_KEY=your_key_here" > .env
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`. The frontend reads `VITE_API_BASE`; defaults to the deployed Cloud Run URL — set it to `http://localhost:8000` for local dev.

---

## 🐳 Deploy to Cloud Run

```bash
# Backend
cd backend
gcloud run deploy sutra-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=your_key_here \
  --memory 512Mi

# Frontend (after backend URL is set in src/api.ts)
cd ../frontend
npm run build
gcloud run deploy sutra-frontend --source . --region us-central1 --allow-unauthenticated
```

---

## 📁 Project Structure

```
sutra/
├── backend/
│   ├── main.py            # FastAPI app + endpoints + cache pre-warming
│   ├── orchestrator.py    # Orchestrator + 6 sub-agents + Learner
│   ├── tools.py           # Tool implementations (calendar, tasks, weather, ...)
│   ├── db.py              # SQLite schema + demo seed data
│   ├── requirements.txt
│   ├── Dockerfile
│   └── sutra.db
├── frontend/
│   ├── src/
│   │   ├── screens/       # Orchestrate · Schedule · Logs · Knowledge
│   │   ├── components/    # TopBar, BottomNav
│   │   ├── api.ts         # Backend client
│   │   └── App.tsx
│   └── package.json
├── architecture.svg
└── README.md
```

---

## 💡 How It Works

1. **User sends a query** via the React frontend (voice or text)
2. **FastAPI backend** forwards it to `orchestrate()`
3. **Response cache** check — pre-warmed demo prompts return instantly
4. **Orchestrator** asks Gemini for a JSON plan: which sub-agents are needed and what each should do
5. **Each selected sub-agent** runs with its own system prompt and tool declarations; Gemini decides which tools to call
6. **Tools execute** against SQLite (calendar, tasks) or simulated MCP endpoints (weather, screen scan, focus mode)
7. **Learner** logs the request to `request_history` and pushes a pattern-based insight if one is detected
8. **Orchestrator** synthesizes a final summary and streams the full trace back to the frontend

---

## 📝 Built For

Google Cloud Gen AI Academy APAC Edition Hackathon 2026
**Built by:** Vishwas Prabhakara

## 📄 License

MIT
