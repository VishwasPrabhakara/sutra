const API_BASE =
  import.meta.env.VITE_API_BASE || 'https://sutra-backend-381066349460.us-central1.run.app';

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

export interface AgentResult {
  agent: string;
  summary: string;
  tool_results: Array<{
    tool: string;
    result: unknown;
  }>;
}

export interface OrchestrateResponse {
  user_request: string;
  plan: {
    agents_needed: string[];
    [key: string]: unknown;
  };
  results: AgentResult[];
  trace: TraceStep[];
  insight: string | null;
  token_count: number;
}

export interface StreamEvent {
  event: 'trace' | 'plan' | 'complete' | 'error';
  data: TraceStep | OrchestrateResponse | {
    plan: OrchestrateResponse['plan'];
    step: TraceStep;
  } | {
    message: string;
  };
  token_count?: number;
  cached?: boolean;
}

export interface StreamCallbacks {
  onTrace?: (
    step: TraceStep,
    tokenCount: number,
  ) => void;

  onPlan?: (
    plan: OrchestrateResponse['plan'],
    step: TraceStep,
    tokenCount: number,
  ) => void;

  onComplete?: (
    response: OrchestrateResponse,
    tokenCount: number,
  ) => void;

  onError?: (error: Error) => void;
}

export interface CalendarEvent {
  id: number | string;
  user_id: string;
  title: string;
  start_time: string;
  end_time: string;
  created_at: string;
  source?: 'google' | 'local';
}

export interface Task {
  id: number;
  user_id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
}

export interface HistoryEntry {
  id: number;
  user_id: string;
  request_text: string;
  request_type: string;
  created_at: string;
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

export interface CalendarConnectionStatus {
  provider: string;
  configured: boolean;
  connected: boolean;
}

async function requireSuccess(
  response: Response,
  operation: string,
): Promise<Response> {
  if (!response.ok) {
    let details = response.statusText;

    try {
      const body = await response.json();
      details = body.message || body.detail || details;
    } catch {
      // Keep the HTTP status text.
    }

    throw new Error(
      `${operation} failed: ${response.status} ${details}`,
    );
  }

  return response;
}

export async function orchestrate(
  request: string,
  userId = 'vishwas',
): Promise<OrchestrateResponse> {
  const response = await fetch(`${API_BASE}/orchestrate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request,
      user_id: userId,
    }),
  });

  await requireSuccess(response, 'Orchestration');
  return response.json();
}

export async function streamOrchestration(
  request: string,
  callbacks: StreamCallbacks,
  userId = 'vishwas',
  signal?: AbortSignal,
): Promise<void> {
  try {
    const response = await fetch(
      `${API_BASE}/orchestrate/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          request,
          user_id: userId,
        }),
        signal,
      },
    );

    await requireSuccess(response, 'Streaming orchestration');

    if (!response.body) {
      throw new Error('The browser did not provide a response stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const eventBlocks = buffer.split(/\r?\n\r?\n/);
      buffer = eventBlocks.pop() || '';

      for (const block of eventBlocks) {
        processSseBlock(block, callbacks);
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      processSseBlock(buffer, callbacks);
    }
  } catch (error) {
    if (
      error instanceof DOMException
      && error.name === 'AbortError'
    ) {
      return;
    }

    const normalizedError =
      error instanceof Error
        ? error
        : new Error('Unknown streaming error');

    callbacks.onError?.(normalizedError);
    throw normalizedError;
  }
}

function processSseBlock(
  block: string,
  callbacks: StreamCallbacks,
): void {
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return;
  }

  const event = JSON.parse(
    dataLines.join('\n'),
  ) as StreamEvent;

  const tokenCount = event.token_count || 0;

  if (eventName === 'trace') {
    callbacks.onTrace?.(
      event.data as TraceStep,
      tokenCount,
    );
    return;
  }

  if (eventName === 'plan') {
    const planData = event.data as {
      plan: OrchestrateResponse['plan'];
      step: TraceStep;
    };

    callbacks.onPlan?.(
      planData.plan,
      planData.step,
      tokenCount,
    );
    return;
  }

  if (eventName === 'complete') {
    callbacks.onComplete?.(
      event.data as OrchestrateResponse,
      tokenCount,
    );
    return;
  }

  if (eventName === 'error') {
    const errorData = event.data as {
      message?: string;
    };

    throw new Error(
      errorData.message || 'Sutra stream failed',
    );
  }
}

export async function getEvents(
  userId = 'vishwas',
): Promise<{
  status: string;
  count: number;
  events: CalendarEvent[];
  source?: string;
}> {
  const response = await fetch(
    `${API_BASE}/api/events?user_id=${encodeURIComponent(userId)}`,
  );

  await requireSuccess(response, 'Events request');
  return response.json();
}

export async function getTasks(
  userId = 'vishwas',
): Promise<{
  status: string;
  count: number;
  tasks: Task[];
}> {
  const response = await fetch(
    `${API_BASE}/api/tasks?user_id=${encodeURIComponent(userId)}`,
  );

  await requireSuccess(response, 'Tasks request');
  return response.json();
}

export async function getHistory(
  userId = 'vishwas',
  limit = 20,
): Promise<{
  status: string;
  count: number;
  history: HistoryEntry[];
}> {
  const response = await fetch(
    `${API_BASE}/api/history`
    + `?user_id=${encodeURIComponent(userId)}`
    + `&limit=${limit}`,
  );

  await requireSuccess(response, 'History request');
  return response.json();
}

export async function getInsights(
  userId = 'vishwas',
): Promise<InsightsResponse> {
  const response = await fetch(
    `${API_BASE}/api/insights?user_id=${encodeURIComponent(userId)}`,
  );

  await requireSuccess(response, 'Insights request');
  return response.json();
}

export async function getCalendarStatus(
  userId = 'vishwas',
): Promise<CalendarConnectionStatus> {
  const response = await fetch(
    `${API_BASE}/auth/status?user_id=${encodeURIComponent(userId)}`,
  );

  await requireSuccess(response, 'Calendar status request');
  return response.json();
}

export function getCalendarLoginUrl(
  userId = 'vishwas',
): string {
  return (
    `${API_BASE}/auth/login`
    + `?user_id=${encodeURIComponent(userId)}`
  );
}

export async function disconnectCalendar(
  userId = 'vishwas',
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/auth/disconnect`
    + `?user_id=${encodeURIComponent(userId)}`,
    {
      method: 'POST',
    },
  );

  await requireSuccess(response, 'Calendar disconnect');
}