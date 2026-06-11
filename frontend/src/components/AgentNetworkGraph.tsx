import {
  Brain,
  CalendarDays,
  CheckSquare,
  CloudSun,
  Lightbulb,
  Mail,
  Search,
} from 'lucide-react';

import type { TraceStep } from '../api';

interface AgentNetworkGraphProps {
  trace: TraceStep[];
  loading: boolean;
}

interface AgentDefinition {
  name: string;
  shortName: string;
  x: number;
  y: number;
  color: string;
  icon: typeof Brain;
}

const AGENTS: AgentDefinition[] = [
  {
    name: 'Orchestrator',
    shortName: 'Core',
    x: 50,
    y: 50,
    color: '#7dd3fc',
    icon: Brain,
  },
  {
    name: 'Scheduler',
    shortName: 'Schedule',
    x: 50,
    y: 9,
    color: '#a78bfa',
    icon: CalendarDays,
  },
  {
    name: 'TaskAgent',
    shortName: 'Tasks',
    x: 84,
    y: 27,
    color: '#34d399',
    icon: CheckSquare,
  },
  {
    name: 'Scribe',
    shortName: 'Scribe',
    x: 84,
    y: 73,
    color: '#f472b6',
    icon: Mail,
  },
  {
    name: 'WeatherAgent',
    shortName: 'Weather',
    x: 50,
    y: 91,
    color: '#60a5fa',
    icon: CloudSun,
  },
  {
    name: 'ResearchAgent',
    shortName: 'Research',
    x: 16,
    y: 73,
    color: '#fbbf24',
    icon: Search,
  },
  {
    name: 'Learner',
    shortName: 'Learner',
    x: 16,
    y: 27,
    color: '#fde047',
    icon: Lightbulb,
  },
];

const TERMINAL_TYPES = new Set([
  'complete',
  'tool_result',
  'final',
  'insight',
]);

export default function AgentNetworkGraph({
  trace,
  loading,
}: AgentNetworkGraphProps) {
  const latestByAgent = new Map<string, TraceStep>();

  for (const step of trace) {
    latestByAgent.set(step.agent, step);
  }

  const activatedAgents = new Set(
    trace.map((step) => step.agent),
  );

  const activeAgent = [...trace]
    .reverse()
    .find(
      (step) =>
        step.type === 'thinking'
        || step.type === 'tool_call'
        || step.type === 'plan',
    )?.agent;

  const orchestrator = AGENTS[0];

  return (
    <section className="rounded-3xl border border-surface-high bg-surface-low p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
            Agent Network
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Live dispatch and execution topology
          </p>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-primary">
          <span
            className={`h-2 w-2 rounded-full bg-primary ${
              loading ? 'animate-pulse' : ''
            }`}
          />
          {loading ? 'Running' : 'Ready'}
        </div>
      </div>

      <div className="relative mx-auto aspect-square max-w-[460px] overflow-hidden rounded-[2rem] border border-surface-high bg-[#071126]">
        <div className="absolute inset-0 opacity-30 network-grid" />

        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {AGENTS.slice(1).map((agent) => {
            const connected = activatedAgents.has(agent.name);

            return (
              <line
                key={agent.name}
                x1={orchestrator.x}
                y1={orchestrator.y}
                x2={agent.x}
                y2={agent.y}
                stroke={connected ? agent.color : '#243450'}
                strokeWidth={connected ? 0.7 : 0.35}
                strokeDasharray={connected ? '2 1.5' : '1.2 2'}
                className={connected ? 'network-line-active' : ''}
              />
            );
          })}
        </svg>

        {AGENTS.map((agent) => {
          const Icon = agent.icon;
          const latest = latestByAgent.get(agent.name);
          const activated = activatedAgents.has(agent.name);
          const active = loading && activeAgent === agent.name;
          const completed = Boolean(
            latest && TERMINAL_TYPES.has(latest.type),
          );

          return (
            <div
              key={agent.name}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${agent.x}%`,
                top: `${agent.y}%`,
              }}
            >
              <div
                className={[
                  'relative flex h-14 w-14 items-center justify-center rounded-2xl border transition-all duration-500',
                  activated
                    ? 'scale-100 opacity-100'
                    : 'scale-90 opacity-45',
                  active ? 'network-node-active' : '',
                ].join(' ')}
                style={{
                  borderColor: activated
                    ? agent.color
                    : '#2a3954',
                  backgroundColor: activated
                    ? `${agent.color}20`
                    : '#0c1930',
                  boxShadow: active
                    ? `0 0 28px ${agent.color}70`
                    : undefined,
                  color: agent.color,
                }}
              >
                <Icon className="h-5 w-5" />

                {active && (
                  <span
                    className="absolute -inset-2 rounded-3xl border animate-ping"
                    style={{
                      borderColor: `${agent.color}80`,
                    }}
                  />
                )}

                {completed && (
                  <span
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-[#071126]"
                    style={{
                      backgroundColor: agent.color,
                    }}
                  >
                    ✓
                  </span>
                )}
              </div>

              <div className="absolute left-1/2 top-[62px] -translate-x-1/2 whitespace-nowrap text-center">
                <p
                  className="text-[10px] font-bold"
                  style={{
                    color: activated
                      ? agent.color
                      : '#71809a',
                  }}
                >
                  {agent.shortName}
                </p>

                <p className="mt-0.5 text-[8px] font-mono uppercase tracking-wider text-on-surface-variant">
                  {active
                    ? 'active'
                    : completed
                      ? 'done'
                      : activated
                        ? 'linked'
                        : 'standby'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric
          label="Activated"
          value={activatedAgents.size}
        />
        <Metric
          label="Tool calls"
          value={
            trace.filter(
              (step) => step.type === 'tool_call',
            ).length
          }
        />
        <Metric
          label="Completed"
          value={
            trace.filter(
              (step) =>
                step.type === 'complete'
                || step.type === 'final',
            ).length
          }
        />
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-surface-high bg-surface-highest px-3 py-2">
      <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg font-bold text-primary">
        {value}
      </p>
    </div>
  );
}
