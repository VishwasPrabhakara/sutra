import {
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Cpu,
  Lightbulb,
  LoaderCircle,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import type { TraceStep } from '../api';

interface CompactTraceProps {
  trace: TraceStep[];
  loading: boolean;
}

interface AgentGroup {
  agent: string;
  steps: TraceStep[];
  latest: TraceStep;
  active: boolean;
  completed: boolean;
  error: boolean;
}

const AGENT_COLORS: Record<string, string> = {
  Orchestrator:
    'border-primary/30 bg-primary/5 text-primary',
  Scheduler:
    'border-violet-300/30 bg-violet-300/5 text-violet-300',
  TaskAgent:
    'border-emerald-300/30 bg-emerald-300/5 text-emerald-300',
  Scribe:
    'border-pink-300/30 bg-pink-300/5 text-pink-300',
  WeatherAgent:
    'border-blue-300/30 bg-blue-300/5 text-blue-300',
  ResearchAgent:
    'border-yellow-300/30 bg-yellow-300/5 text-yellow-300',
  Learner:
    'border-yellow-200/30 bg-yellow-200/5 text-yellow-200',
};

const TYPE_ICONS: Record<string, typeof Brain> = {
  thinking: Brain,
  plan: Cpu,
  tool_call: Wrench,
  tool_result: CheckCircle2,
  complete: CheckCircle2,
  insight: Lightbulb,
  final: Sparkles,
  error: CircleAlert,
};

const COMPLETED_TYPES = new Set([
  'complete',
  'final',
  'insight',
]);

function groupTrace(
  trace: TraceStep[],
  loading: boolean,
): AgentGroup[] {
  const groups = new Map<string, TraceStep[]>();

  for (const step of trace) {
    const existing = groups.get(step.agent) || [];
    existing.push(step);
    groups.set(step.agent, existing);
  }

  const orderedAgents = [...groups.keys()];
  const latestAgent = trace.at(-1)?.agent;

  return orderedAgents.map((agent) => {
    const steps = groups.get(agent) || [];
    const latest = steps.at(-1)!;

    return {
      agent,
      steps,
      latest,
      active:
        loading
        && latestAgent === agent
        && !COMPLETED_TYPES.has(latest.type)
        && latest.type !== 'error',
      completed: COMPLETED_TYPES.has(latest.type),
      error: latest.type === 'error',
    };
  });
}

function formatTime(timestamp: string): string {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function agentSummary(group: AgentGroup): string {
  const toolCalls = group.steps.filter(
    (step) => step.type === 'tool_call',
  );

  const toolResults = group.steps.filter(
    (step) => step.type === 'tool_result',
  );

  if (group.error) {
    return group.latest.message;
  }

  if (group.active) {
    return group.latest.message;
  }

  if (group.completed) {
    return group.latest.message;
  }

  if (toolResults.length > 0) {
    return `${toolResults.length} tool ${
      toolResults.length === 1 ? 'result' : 'results'
    } received`;
  }

  if (toolCalls.length > 0) {
    return `Using ${toolCalls
      .map((step) => step.tool)
      .filter(Boolean)
      .join(', ')}`;
  }

  return group.latest.message;
}

export default function CompactTrace({
  trace,
  loading,
}: CompactTraceProps) {
  const groups = useMemo(
    () => groupTrace(trace, loading),
    [trace, loading],
  );

  const [
    expansionOverrides,
    setExpansionOverrides,
  ] = useState<Record<string, boolean>>({});

  const toggleAgent = (
    agent: string,
    defaultExpanded: boolean,
  ) => {
    setExpansionOverrides((current) => ({
      ...current,
      [agent]: !(
        current[agent]
        ?? defaultExpanded
      ),
    }));
  };

  return (
    <section className="rounded-3xl border border-surface-high bg-surface-low p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
            Agent Activity
          </p>

          <p className="mt-1 text-xs text-on-surface-variant">
            {groups.length} agents · {trace.length} events
          </p>
        </div>

        {loading && (
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-primary">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            Streaming
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-surface-high px-4 py-9 text-center">
          <Brain className="mx-auto h-7 w-7 text-on-surface-variant/50" />

          <p className="mt-3 text-sm text-on-surface-variant">
            Dispatch a request to watch the agents work.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const expanded =
              expansionOverrides[group.agent]
              ?? group.active;

            const color =
              AGENT_COLORS[group.agent]
              || 'border-surface-high bg-surface-highest text-on-surface-variant';

            return (
              <article
                key={group.agent}
                className={`overflow-hidden rounded-2xl border transition-colors ${color}`}
              >
                <button
                  type="button"
                  onClick={() =>
                    toggleAgent(
                      group.agent,
                      group.active,
                    )
                  }
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <StatusIcon group={group} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">
                        {group.agent}
                      </span>

                      <span className="rounded-full bg-black/15 px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider opacity-70">
                        {group.steps.length}{' '}
                        {group.steps.length === 1
                          ? 'step'
                          : 'steps'}
                      </span>
                    </div>

                    <p className="mt-0.5 truncate text-xs text-on-surface-variant">
                      {agentSummary(group)}
                    </p>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-2">
                    <AgentState group={group} />

                    {expanded ? (
                      <ChevronDown className="h-4 w-4 opacity-60" />
                    ) : (
                      <ChevronRight className="h-4 w-4 opacity-60" />
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-current/10 bg-black/10 px-4 py-3">
                    <div className="space-y-3">
                      {group.steps.map(
                        (step, index) => (
                          <TraceDetail
                            key={`${step.timestamp}-${index}`}
                            step={step}
                            isLast={
                              index
                              === group.steps.length - 1
                            }
                          />
                        ),
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StatusIcon({
  group,
}: {
  group: AgentGroup;
}) {
  if (group.active) {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-current/10">
        <LoaderCircle className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (group.error) {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-red-400/10 text-red-300">
        <CircleAlert className="h-4 w-4" />
      </div>
    );
  }

  if (group.completed) {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
        <CheckCircle2 className="h-4 w-4" />
      </div>
    );
  }

  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-current/10">
      <Brain className="h-4 w-4" />
    </div>
  );
}

function AgentState({
  group,
}: {
  group: AgentGroup;
}) {
  let label = 'Waiting';
  let className =
    'border-surface-high text-on-surface-variant';

  if (group.active) {
    label = 'Active';
    className =
      'border-primary/30 bg-primary/10 text-primary';
  } else if (group.error) {
    label = 'Error';
    className =
      'border-red-400/30 bg-red-400/10 text-red-300';
  } else if (group.completed) {
    label = 'Done';
    className =
      'border-emerald-400/30 bg-emerald-400/10 text-emerald-300';
  }

  return (
    <span
      className={`rounded-full border px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider ${className}`}
    >
      {label}
    </span>
  );
}

function TraceDetail({
  step,
  isLast,
}: {
  step: TraceStep;
  isLast: boolean;
}) {
  const Icon =
    TYPE_ICONS[step.type] || Brain;

  return (
    <div className="relative flex gap-3">
      {!isLast && (
        <span className="absolute left-[7px] top-5 h-[calc(100%+4px)] w-px bg-current/15" />
      )}

      <div className="relative z-10 mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-surface-low">
        <Icon className="h-3 w-3" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-wider opacity-70">
            {step.type.replace('_', ' ')}
          </span>

          {step.tool && (
            <span className="rounded bg-black/15 px-1.5 py-0.5 font-mono text-[9px]">
              {step.tool}
            </span>
          )}

          <span className="ml-auto font-mono text-[8px] opacity-45">
            {formatTime(step.timestamp)}
          </span>
        </div>

        <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
          {step.message}
        </p>
      </div>
    </div>
  );
}
