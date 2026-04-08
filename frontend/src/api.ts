// Sutra API client — talks to the FastAPI backend.

const API_BASE = import.meta.env.VITE_API_BASE || 'https://sutra-backend-381066349460.us-central1.run.app';

export interface TraceStep {
  agent: string;
  type: string;
  message: string;
  timestamp: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  agents?: string[];
}

export interface OrchestrateResponse {
  user_request: string;
  plan: {
    agents_needed: string[];
    [key: string]: unknown;
  };
  results: Array<{
    agent: string;
    summary: string;
    tool_results: Array<{ tool: string; result: unknown }>;
  }>;
  trace: TraceStep[];
  insight: string | null;
}

export interface CalendarEvent {
  id: number;
  user_id: string;
  title: string;
  start_time: string;
  end_time: string;
  created_at: string;
}

export interface Task {
  id: number;
  user_id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
}

export async function orchestrate(request: string, userId = 'vishwas'): Promise<OrchestrateResponse> {
  const res = await fetch(`${API_BASE}/orchestrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request, user_id: userId }),
  });
  if (!res.ok) throw new Error(`Sutra API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function getEvents(userId = 'vishwas'): Promise<{ status: string; count: number; events: CalendarEvent[] }> {
  const res = await fetch(`${API_BASE}/api/events?user_id=${userId}`);
  if (!res.ok) throw new Error(`Events fetch failed: ${res.status}`);
  return res.json();
}

export async function getTasks(userId = 'vishwas'): Promise<{ status: string; count: number; tasks: Task[] }> {
  const res = await fetch(`${API_BASE}/api/tasks?user_id=${userId}`);
  if (!res.ok) throw new Error(`Tasks fetch failed: ${res.status}`);
  return res.json();
}

export interface HistoryEntry {
  id: number;
  user_id: string;
  request_text: string;
  request_type: string;
  created_at: string;
}

export async function getHistory(userId = 'vishwas', limit = 20): Promise<{ status: string; count: number; history: HistoryEntry[] }> {
  const res = await fetch(`${API_BASE}/api/history?user_id=${userId}&limit=${limit}`);
  if (!res.ok) throw new Error(`History fetch failed: ${res.status}`);
  return res.json();
}

export interface PatternStat {
  request_type: string;
  count: number;
  last_used: string;
}

export interface InsightsResponse {
  status: string;
  current_insight: string | null;
  patterns: PatternStat[];
  pattern_count: number;
}

export async function getInsights(userId = 'vishwas'): Promise<InsightsResponse> {
  const res = await fetch(`${API_BASE}/api/insights?user_id=${userId}`);
  if (!res.ok) throw new Error(`Insights fetch failed: ${res.status}`);
  return res.json();
}