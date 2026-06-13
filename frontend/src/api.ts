const API_BASE =
  import.meta.env.VITE_API_BASE
  || 'http://localhost:8000';

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

export interface ToolResult {
  tool: string;
  result: unknown;
}

export interface AgentResult {
  agent: string;
  summary: string;
  tool_results: ToolResult[];
}

export interface OrchestrateResponse {
  user_request: string;
  final_message: string;
  plan: {
    agents_needed: string[];
    [key: string]: unknown;
  };
  results: AgentResult[];
  trace: TraceStep[];
  insight: string | null;
  token_count: number;
  cached: boolean;
  demo_mode: boolean;
}

export interface StreamEvent {
  event:
    | 'trace'
    | 'plan'
    | 'complete'
    | 'error';

  data:
    | TraceStep
    | OrchestrateResponse
    | {
        plan: OrchestrateResponse['plan'];
        step: TraceStep;
      }
    | {
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
    cached: boolean,
  ) => void;

  onError?: (
    error: Error,
  ) => void;
}

export interface CalendarEvent {
  id: number | string;
  user_id: string;
  title: string;
  start_time: string;
  end_time: string;
  created_at: string;
  description?: string;
  location?: string;
  event_url?: string;
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

export interface ConversationMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
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

export interface GoogleConnectionStatus {
  provider: string;
  configured: boolean;
  connected: boolean;
  calendar_connected: boolean;
  gmail_connected: boolean;
  requires_reconnect: boolean;
  scopes: string[];
}

/**
 * Compatibility type used by ConnectCalendar.tsx.
 */
export type CalendarConnectionStatus =
  GoogleConnectionStatus;

export interface PendingEmail {
  recipient: string;
  subject: string;
  body: string;
  cc: string[];
}

export interface PendingAction {
  id: number;
  user_id: string;
  action_type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  payload: PendingEmail;
}

export interface ConfirmActionResponse {
  status: string;
  action_id: number;
  result: {
    status: string;
    message: string;
    recipient?: string;
    subject?: string;
    message_id?: string;
    thread_id?: string;
    source?: string;
  };
}

async function requireSuccess(
  response: Response,
  operation: string,
): Promise<Response> {
  if (!response.ok) {
    let details = response.statusText;

    try {
      const body = await response.json();

      details =
        body.message
        || body.detail
        || details;
    } catch {
      // Keep the HTTP status text.
    }

    throw new Error(
      `${operation} failed: `
      + `${response.status} ${details}`,
    );
  }

  return response;
}

export async function orchestrate(
  request: string,
  userId = getUserId(),
  demoMode = false,
): Promise<OrchestrateResponse> {
  const response = await fetch(
    `${API_BASE}/orchestrate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        request,
        user_id: userId,
        demo_mode: demoMode,
      }),
    },
  );

  await requireSuccess(
    response,
    'Orchestration',
  );

  return response.json();
}

export async function streamOrchestration(
  request: string,
  callbacks: StreamCallbacks,
  userId = getUserId(),
  signal?: AbortSignal,
  demoMode = false,
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
          demo_mode: demoMode,
        }),
        signal,
      },
    );

    await requireSuccess(
      response,
      'Streaming orchestration',
    );

    if (!response.body) {
      throw new Error(
        'The browser did not provide '
        + 'a response stream',
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const {
        value,
        done,
      } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(
        value,
        {
          stream: true,
        },
      );

      const eventBlocks =
        buffer.split(/\r?\n\r?\n/);

      buffer = eventBlocks.pop() || '';

      for (const block of eventBlocks) {
        processSseBlock(
          block,
          callbacks,
        );
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      processSseBlock(
        buffer,
        callbacks,
      );
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
        : new Error(
            'Unknown streaming error',
          );

    callbacks.onError?.(
      normalizedError,
    );

    throw normalizedError;
  }
}

function processSseBlock(
  block: string,
  callbacks: StreamCallbacks,
): void {
  let eventName = 'message';
  const dataLines: string[] = [];

  for (
    const line
    of block.split(/\r?\n/)
  ) {
    if (line.startsWith('event:')) {
      eventName = line
        .slice(6)
        .trim();
    }

    if (line.startsWith('data:')) {
      dataLines.push(
        line.slice(5).trimStart(),
      );
    }
  }

  if (dataLines.length === 0) {
    return;
  }

  const event = JSON.parse(
    dataLines.join('\n'),
  ) as StreamEvent;

  const tokenCount =
    event.token_count || 0;

  if (eventName === 'trace') {
    callbacks.onTrace?.(
      event.data as TraceStep,
      tokenCount,
    );

    return;
  }

  if (eventName === 'plan') {
    const planData =
      event.data as {
        plan:
          OrchestrateResponse['plan'];
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
      Boolean(event.cached),
    );

    return;
  }

  if (eventName === 'error') {
    const errorData =
      event.data as {
        message?: string;
      };

    throw new Error(
      errorData.message
      || 'Sutra stream failed',
    );
  }
}

export async function getEvents(
  userId = getUserId(),
): Promise<{
  status: string;
  count: number;
  events: CalendarEvent[];
  source?: string;
}> {
  const response = await fetch(
    `${API_BASE}/api/events`
    + `?user_id=${
      encodeURIComponent(userId)
    }`,
  );

  await requireSuccess(
    response,
    'Events request',
  );

  return response.json();
}

export async function getTasks(
  userId = getUserId(),
): Promise<{
  status: string;
  count: number;
  tasks: Task[];
}> {
  const response = await fetch(
    `${API_BASE}/api/tasks`
    + `?user_id=${
      encodeURIComponent(userId)
    }`,
  );

  await requireSuccess(
    response,
    'Tasks request',
  );

  return response.json();
}

export async function getHistory(
  userId = getUserId(),
  limit = 20,
): Promise<{
  status: string;
  count: number;
  history: HistoryEntry[];
}> {
  const response = await fetch(
    `${API_BASE}/api/history`
    + `?user_id=${
      encodeURIComponent(userId)
    }`
    + `&limit=${limit}`,
  );

  await requireSuccess(
    response,
    'History request',
  );

  return response.json();
}

export async function getConversation(
  userId = getUserId(),
  turns = 5,
): Promise<{
  status: string;
  count: number;
  messages: ConversationMessage[];
}> {
  const response = await fetch(
    `${API_BASE}/api/conversation`
    + `?user_id=${
      encodeURIComponent(userId)
    }`
    + `&turns=${turns}`,
  );

  await requireSuccess(
    response,
    'Conversation request',
  );

  return response.json();
}

export async function clearConversation(
  userId = getUserId(),
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/conversation`
    + `?user_id=${
      encodeURIComponent(userId)
    }`,
    {
      method: 'DELETE',
    },
  );

  await requireSuccess(
    response,
    'Clear conversation',
  );
}

export async function getInsights(
  userId = getUserId(),
): Promise<InsightsResponse> {
  const response = await fetch(
    `${API_BASE}/api/insights`
    + `?user_id=${
      encodeURIComponent(userId)
    }`,
  );

  await requireSuccess(
    response,
    'Insights request',
  );

  return response.json();
}

export async function getGoogleStatus(
  userId = getUserId(),
): Promise<GoogleConnectionStatus> {
  const response = await fetch(
    `${API_BASE}/auth/status`
    + `?user_id=${
      encodeURIComponent(userId)
    }`,
  );

  await requireSuccess(
    response,
    'Google status request',
  );

  return response.json();
}

/**
 * Compatibility alias for ConnectCalendar.tsx.
 */
export const getCalendarStatus =
  getGoogleStatus;

export function getGoogleLoginUrl(
  userId = getUserId(),
): string {
  return (
    `${API_BASE}/auth/login`
    + `?user_id=${
      encodeURIComponent(userId)
    }`
  );
}

/**
 * Compatibility alias for ConnectCalendar.tsx.
 */
export const getCalendarLoginUrl =
  getGoogleLoginUrl;

export async function disconnectGoogle(
  userId = getUserId(),
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/auth/disconnect`
    + `?user_id=${
      encodeURIComponent(userId)
    }`,
    {
      method: 'POST',
    },
  );

  await requireSuccess(
    response,
    'Google disconnect',
  );
}

/**
 * Compatibility alias for ConnectCalendar.tsx.
 */
export const disconnectCalendar =
  disconnectGoogle;

export async function getPendingAction(
  actionId: number,
  userId = getUserId(),
): Promise<PendingAction> {
  const response = await fetch(
    `${API_BASE}/api/actions/${actionId}`
    + `?user_id=${
      encodeURIComponent(userId)
    }`,
  );

  await requireSuccess(
    response,
    'Pending action request',
  );

  const body = await response.json();

  return body.action;
}

export async function confirmAction(
  actionId: number,
  userId = getUserId(),
): Promise<ConfirmActionResponse> {
  const response = await fetch(
    `${API_BASE}/api/actions/`
    + `${actionId}/confirm`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
      }),
    },
  );

  await requireSuccess(
    response,
    'Action confirmation',
  );

  return response.json();
}

export async function cancelAction(
  actionId: number,
  userId = getUserId(),
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/actions/`
    + `${actionId}/cancel`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
      }),
    },
  );

  await requireSuccess(
    response,
    'Action cancellation',
  );
}
import { getUserId } from './user';
