import {
  Activity,
  AlertCircle,
  Brain,
  CalendarDays,
  CheckSquare,
  Clock,
  Mail,
  RefreshCw,
  Search,
  ScrollText,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  getHistory,
  type HistoryEntry,
} from '../api';

import { getUserId } from '../user';

const USER_ID = getUserId();

const AGENT_STYLES:
  Record<string, string> = {
    scheduler:
      'border-violet-300/30 bg-violet-300/5 text-violet-300',
    tasks:
      'border-emerald-300/30 bg-emerald-300/5 text-emerald-300',
    scribe:
      'border-pink-300/30 bg-pink-300/5 text-pink-300',
    weather:
      'border-blue-300/30 bg-blue-300/5 text-blue-300',
    research:
      'border-yellow-300/30 bg-yellow-300/5 text-yellow-300',
    unknown:
      'border-surface-high bg-surface-highest text-on-surface-variant',
  };

const AGENT_LABELS:
  Record<string, string> = {
    scheduler: 'Scheduler',
    tasks: 'TaskAgent',
    scribe: 'Scribe',
    weather: 'WeatherAgent',
    research: 'ResearchAgent',
    unknown: 'Unknown',
  };

export default function Logs() {
  const [history, setHistory] =
    useState<HistoryEntry[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await getHistory(
        USER_ID,
        100,
      );

      setHistory(response.history);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to load workflow history.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const agentCounts = useMemo(
    () =>
      history.reduce(
        (
          counts,
          entry,
        ) => {
          const requestType =
            normalizeType(
              entry.request_type,
            );

          counts[requestType] =
            (
              counts[requestType]
              || 0
            ) + 1;

          return counts;
        },
        {} as Record<string, number>,
      ),
    [history],
  );

  const sortedAgents = useMemo(
    () =>
      Object.entries(agentCounts)
        .sort(
          (
            first,
            second,
          ) =>
            second[1]
            - first[1],
        ),
    [agentCounts],
  );

  const mostUsedAgent =
    sortedAgents[0];

  const uniqueAgents =
    sortedAgents.length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 pb-32 md:px-8 md:py-10">
      <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">
            Execution History · Persistent
          </p>

          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            Agent Workflow Logs
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
            Requests stored by Sutra for
            workflow history, conversation
            context, and Learner insights.
          </p>
        </div>

        <button
          type="button"
          onClick={loadHistory}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-surface-high bg-surface-low px-4 py-2 font-mono text-[11px] uppercase tracking-wider transition-colors hover:bg-surface-high disabled:opacity-50"
        >
          <RefreshCw
            className={[
              'h-3.5 w-3.5 text-tertiary',
              loading
                ? 'animate-spin'
                : '',
            ].join(' ')}
          />

          {loading
            ? 'Loading...'
            : 'Refresh'}
        </button>
      </header>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          icon={Activity}
          label="Total Runs"
          value={String(
            history.length,
          )}
          color="text-primary"
        />

        <StatCard
          icon={Brain}
          label="Most-used Agent"
          value={
            mostUsedAgent
              ? (
                  `${getAgentLabel(
                    mostUsedAgent[0],
                  )} (${mostUsedAgent[1]})`
                )
              : 'None yet'
          }
          color="text-secondary"
        />

        <StatCard
          icon={Clock}
          label="Last Activity"
          value={
            history[0]
              ? relativeTime(
                  history[0]
                    .created_at,
                )
              : 'No activity'
          }
          color="text-tertiary"
        />
      </section>

      {sortedAgents.length > 0 && (
        <section className="mb-6 rounded-[2rem] border border-surface-high bg-surface-low p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold">
                Agent Distribution
              </h2>

              <p className="mt-1 text-[10px] text-on-surface-variant">
                {uniqueAgents} agent categories used
              </p>
            </div>

            <span className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant">
              {history.length} observations
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {sortedAgents.map(
              ([agent, count]) => {
                const style =
                  getAgentStyle(agent);

                return (
                  <div
                    key={agent}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${style}`}
                  >
                    <AgentIcon
                      agent={agent}
                      className="h-3.5 w-3.5"
                    />

                    <span className="text-[10px] font-bold">
                      {getAgentLabel(
                        agent,
                      )}
                    </span>

                    <span className="rounded-full bg-black/15 px-1.5 py-0.5 font-mono text-[8px]">
                      {count}
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </section>
      )}

      <section className="rounded-[2rem] border border-surface-high bg-surface-low p-5 md:p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">
              Workflow Stream
            </h2>

            <p className="mt-1 text-xs text-on-surface-variant">
              Newest requests appear first
            </p>
          </div>

          <span className="font-mono text-[10px] text-on-surface-variant">
            {history.length} shown
          </span>
        </div>

        {loading
          && history.length === 0 ? (
          <EmptyState message="Loading workflow history..." />
        ) : history.length === 0 ? (
          <EmptyState message="No workflows yet. Start a conversation in Orchestrate." />
        ) : (
          <div className="space-y-2">
            {history.map(
              (entry) => (
                <HistoryCard
                  key={entry.id}
                  entry={entry}
                />
              ),
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function HistoryCard({
  entry,
}: {
  entry: HistoryEntry;
}) {
  const requestType =
    normalizeType(
      entry.request_type,
    );

  const style =
    getAgentStyle(requestType);

  return (
    <article
      className={`rounded-2xl border p-4 transition-transform hover:-translate-y-0.5 ${style}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-black/10">
            <AgentIcon
              agent={requestType}
              className="h-4 w-4"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider">
                {getAgentLabel(
                  requestType,
                )}
              </span>

              <span className="font-mono text-[8px] opacity-50">
                #{entry.id}
              </span>
            </div>

            <p className="mt-1 text-sm leading-relaxed text-on-surface">
              {entry.request_text}
            </p>
          </div>
        </div>

        <div className="flex-shrink-0 text-right">
          <p className="font-mono text-[9px] text-on-surface-variant">
            {formatTime(
              entry.created_at,
            )}
          </p>

          <p className="mt-1 text-[9px] text-on-surface-variant/60">
            {relativeTime(
              entry.created_at,
            )}
          </p>
        </div>
      </div>
    </article>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <article className="rounded-2xl border border-surface-high bg-surface-low p-5">
      <div className="mb-2 flex items-center gap-2">
        <Icon
          className={`h-4 w-4 ${color}`}
        />

        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          {label}
        </span>
      </div>

      <p
        className={`text-xl font-extrabold ${color}`}
      >
        {value}
      </p>
    </article>
  );
}

function EmptyState({
  message,
}: {
  message: string;
}) {
  return (
    <div className="py-12 text-center">
      <ScrollText className="mx-auto h-7 w-7 text-on-surface-variant/50" />

      <p className="mt-3 text-sm text-on-surface-variant">
        {message}
      </p>
    </div>
  );
}

function normalizeType(
  requestType: string,
): string {
  const normalized =
    requestType
      ?.trim()
      .toLowerCase();

  return normalized
    || 'unknown';
}

function getAgentStyle(
  agent: string,
): string {
  return (
    AGENT_STYLES[agent]
    || AGENT_STYLES.unknown
  );
}

function AgentIcon({
  agent,
  className,
}: {
  agent: string;
  className: string;
}) {
  switch (agent) {
    case 'scheduler':
      return <CalendarDays className={className} />;
    case 'tasks':
      return <CheckSquare className={className} />;
    case 'scribe':
      return <Mail className={className} />;
    case 'weather':
      return <Activity className={className} />;
    case 'research':
      return <Search className={className} />;
    default:
      return <Brain className={className} />;
  }
}

function getAgentLabel(
  agent: string,
): string {
  return (
    AGENT_LABELS[agent]
    || agent
    || AGENT_LABELS.unknown
  );
}

function formatTime(
  iso: string,
): string {
  const date = new Date(iso);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return iso;
  }

  return date.toLocaleString(
    'en-IN',
    {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    },
  );
}

function relativeTime(
  iso: string,
): string {
  const then =
    new Date(iso).getTime();

  if (
    Number.isNaN(then)
  ) {
    return '';
  }

  const differenceSeconds =
    Math.max(
      0,
      Math.floor(
        (
          Date.now()
          - then
        ) / 1000,
      ),
    );

  if (
    differenceSeconds < 60
  ) {
    return 'just now';
  }

  if (
    differenceSeconds < 3600
  ) {
    return (
      `${Math.floor(
        differenceSeconds / 60,
      )}m ago`
    );
  }

  if (
    differenceSeconds < 86400
  ) {
    return (
      `${Math.floor(
        differenceSeconds / 3600,
      )}h ago`
    );
  }

  return (
    `${Math.floor(
      differenceSeconds / 86400,
    )}d ago`
  );
}
