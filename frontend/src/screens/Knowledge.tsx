import {
  AlertCircle,
  BookOpen,
  Brain,
  CalendarDays,
  CheckSquare,
  CloudSun,
  Database,
  Lightbulb,
  Mail,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  getInsights,
  type PatternStat,
} from '../api';

import { getUserId } from '../user';

const USER_ID = getUserId();

const AGENT_META:
  Record<
    string,
    {
      label: string;
      color: string;
      icon: typeof Brain;
    }
  > = {
    scheduler: {
      label: 'Scheduler',
      color: 'text-violet-300',
      icon: CalendarDays,
    },
    tasks: {
      label: 'TaskAgent',
      color: 'text-emerald-300',
      icon: CheckSquare,
    },
    scribe: {
      label: 'Scribe',
      color: 'text-pink-300',
      icon: Mail,
    },
    weather: {
      label: 'WeatherAgent',
      color: 'text-blue-300',
      icon: CloudSun,
    },
    research: {
      label: 'ResearchAgent',
      color: 'text-yellow-300',
      icon: Search,
    },
    unknown: {
      label: 'Other',
      color: 'text-on-surface-variant',
      icon: Brain,
    },
  };

export default function Knowledge() {
  const [
    currentInsight,
    setCurrentInsight,
  ] = useState<string | null>(null);

  const [patterns, setPatterns] =
    useState<PatternStat[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const loadInsights = async () => {
    setLoading(true);
    setError(null);

    try {
      const response =
        await getInsights(USER_ID);

      setCurrentInsight(
        response.current_insight,
      );

      setPatterns(
        [...response.patterns].sort(
          (
            first,
            second,
          ) =>
            second.count
            - first.count,
        ),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to load Learner insights.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInsights();
  }, []);

  const totalRuns = useMemo(
    () =>
      patterns.reduce(
        (
          total,
          pattern,
        ) =>
          total
          + pattern.count,
        0,
      ),
    [patterns],
  );

  const topPattern =
    patterns[0];

  const topMeta =
    getAgentMeta(
      topPattern?.request_type,
    );

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 pb-32 md:px-8 md:py-10">
      <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-300">
            Learner Agent · Pattern Detection
          </p>

          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            Knowledge Base
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
            Sutra learns which workflows you
            use most and surfaces deterministic
            suggestions from your history.
          </p>
        </div>

        <button
          type="button"
          onClick={loadInsights}
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
            ? 'Analyzing...'
            : 'Refresh'}
        </button>
      </header>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {currentInsight ? (
        <section className="mb-8 rounded-3xl border border-yellow-300/30 bg-gradient-to-br from-yellow-300/15 via-yellow-300/5 to-transparent p-6 md:p-8">
          <div className="flex gap-5">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-yellow-300/20 md:h-16 md:w-16">
              <Lightbulb className="h-7 w-7 text-yellow-300 md:h-8 md:w-8" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-300">
                Active Insight · Pattern Detected
              </p>

              <p className="text-base leading-relaxed text-on-surface md:text-lg">
                {currentInsight}
              </p>

              <div className="mt-4 flex items-center gap-2 text-[11px] text-yellow-300/80">
                <Sparkles className="h-3.5 w-3.5" />

                <span>
                  Learned from your last{' '}
                  {totalRuns}{' '}
                  {totalRuns === 1
                    ? 'workflow'
                    : 'workflows'}
                </span>
              </div>
            </div>
          </div>
        </section>
      ) : (
        !loading && (
          <section className="mb-8 rounded-3xl border border-dashed border-surface-high bg-surface-low/50 p-8 text-center">
            <Lightbulb className="mx-auto h-8 w-8 text-on-surface-variant/40" />

            <p className="mt-3 text-sm text-on-surface-variant">
              Complete more workflows to unlock
              a Learner insight.
            </p>
          </section>
        )
      )}

      <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          icon={Database}
          label="Agent Categories"
          value={String(
            patterns.length,
          )}
          color="text-primary"
        />

        <StatCard
          icon={TrendingUp}
          label="Dominant Pattern"
          value={
            topPattern
              ? topMeta.label
              : 'None yet'
          }
          color={
            topPattern
              ? topMeta.color
              : 'text-secondary'
          }
        />

        <StatCard
          icon={Brain}
          label="Total Observations"
          value={String(
            totalRuns,
          )}
          color="text-tertiary"
        />
      </section>

      <section className="mb-6 rounded-[2rem] border border-surface-high bg-surface-low p-5 md:p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">
              Pattern Breakdown
            </h2>

            <p className="mt-1 text-xs text-on-surface-variant">
              Request frequency by primary agent
            </p>
          </div>

          <span className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant">
            {totalRuns} observations
          </span>
        </div>

        {loading
          && patterns.length === 0 ? (
          <EmptyState message="Analyzing patterns..." />
        ) : patterns.length === 0 ? (
          <EmptyState message="No patterns detected yet. Start a few workflows in Orchestrate." />
        ) : (
          <div className="space-y-3">
            {patterns.map(
              (pattern) => (
                <PatternCard
                  key={
                    pattern.request_type
                  }
                  pattern={pattern}
                  totalRuns={totalRuns}
                />
              ),
            )}
          </div>
        )}
      </section>

      <section className="rounded-[2rem] border border-surface-high bg-surface-lowest p-6">
        <div className="mb-5 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-tertiary" />

          <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
            How the Learner Works
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 text-xs text-on-surface-variant md:grid-cols-3">
          <ExplanationStep
            number="1"
            title="Requests are recorded"
          >
            Each completed workflow stores its
            request, primary agent category and
            timestamp in the request history.
          </ExplanationStep>

          <ExplanationStep
            number="2"
            title="Patterns are aggregated"
          >
            Sutra counts recurring workflow
            categories such as scheduling,
            research, tasks and weather.
          </ExplanationStep>

          <ExplanationStep
            number="3"
            title="Insights are surfaced"
          >
            Deterministic thresholds create
            proactive suggestions. This Learner
            does not train on private user data.
          </ExplanationStep>
        </div>
      </section>
    </div>
  );
}

function PatternCard({
  pattern,
  totalRuns,
}: {
  pattern: PatternStat;
  totalRuns: number;
}) {
  const meta = getAgentMeta(
    pattern.request_type,
  );

  const Icon = meta.icon;

  const percentage =
    totalRuns > 0
      ? (
          pattern.count
          / totalRuns
        ) * 100
      : 0;

  return (
    <article className="rounded-2xl border border-surface-highest bg-surface-high p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-black/10">
            <Icon
              className={`h-4 w-4 ${meta.color}`}
            />
          </div>

          <div>
            <h3 className="text-sm font-bold text-on-surface">
              {meta.label}
            </h3>

            <p className="mt-0.5 font-mono text-[9px] text-on-surface-variant">
              Last used{' '}
              {relativeTime(
                pattern.last_used,
              )}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-lg font-extrabold text-primary">
            {pattern.count}
          </p>

          <p className="font-mono text-[9px] text-on-surface-variant">
            {percentage.toFixed(0)}%
          </p>
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-lowest">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-tertiary transition-all"
          style={{
            width: `${percentage}%`,
          }}
        />
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
  icon: typeof Database;
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

function ExplanationStep({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article>
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 font-mono text-[10px] font-bold text-primary">
          {number}
        </span>

        <h3 className="font-bold text-on-surface">
          {title}
        </h3>
      </div>

      <p className="leading-relaxed">
        {children}
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
      <Brain className="mx-auto h-7 w-7 text-on-surface-variant/40" />

      <p className="mt-3 text-sm text-on-surface-variant">
        {message}
      </p>
    </div>
  );
}

function getAgentMeta(
  requestType?: string,
) {
  const normalized =
    requestType
      ?.trim()
      .toLowerCase()
    || 'unknown';

  return (
    AGENT_META[normalized]
    || {
      ...AGENT_META.unknown,
      label:
        normalized === 'unknown'
          ? 'Other'
          : normalized,
    }
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
    return 'unknown';
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
