import {
  Brain,
  CheckCircle2,
  CircleAlert,
  Cpu,
  Lightbulb,
  Mic,
  Send,
  Sparkles,
  Square,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  streamOrchestration,
  type OrchestrateResponse,
  type TraceStep,
} from '../api';
import AgentNetworkGraph from '../components/AgentNetworkGraph';
import ConnectCalendar from '../components/ConnectCalendar';
import TokenMeter from '../components/TokenMeter';

interface SpeechRecognitionEvent extends Event {
  results: {
    [key: number]: {
      [key: number]: {
        transcript: string;
      };
    };
    length: number;
  };
}

interface SpeechRecognitionInstance
  extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: SpeechRecognitionEvent) => void)
    | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    webkitSpeechRecognition:
      new () => SpeechRecognitionInstance;
    SpeechRecognition:
      new () => SpeechRecognitionInstance;
  }
}

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

const AGENT_COLORS: Record<string, string> = {
  Orchestrator:
    'border-primary/40 bg-primary/5 text-primary',
  Scheduler:
    'border-violet-300/40 bg-violet-300/5 text-violet-300',
  TaskAgent:
    'border-emerald-300/40 bg-emerald-300/5 text-emerald-300',
  Scribe:
    'border-pink-300/40 bg-pink-300/5 text-pink-300',
  WeatherAgent:
    'border-blue-300/40 bg-blue-300/5 text-blue-300',
  ResearchAgent:
    'border-yellow-300/40 bg-yellow-300/5 text-yellow-300',
  RoutineAgent:
    'border-rose-300/40 bg-rose-300/5 text-rose-300',
  ScreenAgent:
    'border-orange-300/40 bg-orange-300/5 text-orange-300',
  Learner:
    'border-yellow-200/40 bg-yellow-200/5 text-yellow-200',
};

const QUICK_PROMPTS = [
  {
    label: 'Calendar + weather',
    text:
      'Check tomorrow weather in Bengaluru '
      + 'and show my calendar.',
  },
  {
    label: 'Research',
    text:
      'Research the latest developer news '
      + 'and show the top Hacker News stories.',
  },
  {
    label: 'Tasks + message',
    text:
      'Create a high priority task to send the Q4 deck '
      + 'and draft a message to Marcus.',
  },
  {
    label: 'Focus',
    text:
      'Activate focus mode for two hours '
      + 'for deep project work.',
  },
  {
    label: 'Screen scan',
    text:
      'Check my WhatsApp for schedule updates.',
  },
  {
    label: 'Hinglish',
    text:
      'Kal Bengaluru ka weather check karo '
      + 'aur mera calendar dikhao.',
  },
];

export default function Orchestrate() {
  const [input, setInput] = useState('');
  const [trace, setTrace] = useState<TraceStep[]>(
    [],
  );
  const [response, setResponse] =
    useState<OrchestrateResponse | null>(null);
  const [planAgents, setPlanAgents] = useState<
    string[]
  >([]);
  const [tokenCount, setTokenCount] = useState(0);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(
    null,
  );

  const abortControllerRef =
    useRef<AbortController | null>(null);
  const recognitionRef =
    useRef<SpeechRecognitionInstance | null>(null);
  const traceEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [trace]);

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search,
    );

    if (params.get('calendar')) {
      params.delete('calendar');

      const query = params.toString();
      const cleanedUrl =
        window.location.pathname
        + (query ? `?${query}` : '');

      window.history.replaceState(
        {},
        '',
        cleanedUrl,
      );
    }
  }, []);

  const handleVoice = () => {
    const Recognition =
      window.SpeechRecognition
      || window.webkitSpeechRecognition;

    if (!Recognition) {
      setError(
        'Voice input requires Chrome or Edge.',
      );
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      setInput(event.results[0][0].transcript);
    };

    recognition.onerror = () => {
      setError('Voice recognition failed.');
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const stopStreaming = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
  };

  const handleSubmit = async (
    overrideInput?: string,
  ) => {
    const requestText =
      overrideInput ?? input;

    if (!requestText.trim() || loading) {
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setInput(requestText);
    setTrace([]);
    setResponse(null);
    setPlanAgents([]);
    setTokenCount(0);
    setCached(false);
    setError(null);
    setLoading(true);

    try {
      await streamOrchestration(
        requestText,
        {
          onTrace: (step, tokens) => {
            setTrace((current) => [
              ...current,
              step,
            ]);
            setTokenCount(tokens);
          },

          onPlan: (plan, step, tokens) => {
            setPlanAgents(plan.agents_needed);
            setTrace((current) => [
              ...current,
              step,
            ]);
            setTokenCount(tokens);
          },

          onComplete: (result, tokens) => {
            setResponse(result);
            setTokenCount(tokens);
            setCached(
              Boolean(
                (
                  result as OrchestrateResponse
                  & { cached?: boolean }
                ).cached,
              ),
            );
          },

          onError: (streamError) => {
            setError(streamError.message);
          },
        },
        'vishwas',
        controller.signal,
      );
    } catch (caughtError) {
      if (
        caughtError instanceof DOMException
        && caughtError.name === 'AbortError'
      ) {
        return;
      }

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'The orchestration failed.',
      );
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const handleKeyDown = (
    event:
      React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      event.key === 'Enter'
      && !event.shiftKey
    ) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const toolOutputs =
    response?.results.flatMap(
      (agentResult) =>
        agentResult.tool_results.map(
          (toolResult) => ({
            agent: agentResult.agent,
            ...toolResult,
          }),
        ),
    ) || [];

  const insight =
    response?.insight
    || [...trace]
      .reverse()
      .find(
        (step) => step.type === 'insight',
      )?.message;

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-5 py-8 pb-32 xl:grid-cols-12">
      <aside className="space-y-5 xl:col-span-5">
        <AgentNetworkGraph
          trace={trace}
          loading={loading}
        />

        <TokenMeter
          tokenCount={tokenCount}
          loading={loading}
          cached={cached}
        />

        <ConnectCalendar />
      </aside>

      <main className="space-y-5 xl:col-span-7">
        <section className="rounded-3xl border border-surface-high bg-surface-low p-6">
          <div className="mb-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              Live Multi-Agent Workspace
            </p>

            <h1 className="mt-2 text-2xl font-extrabold tracking-tight md:text-3xl">
              What should Sutra handle?
            </h1>

            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
              Watch planning, agent dispatch, tool
              execution, and results arrive in real time.
            </p>
          </div>

          <textarea
            value={input}
            onChange={(event) =>
              setInput(event.target.value)
            }
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder={
              'Ask in English or Hinglish...'
            }
            rows={4}
            className="w-full resize-none rounded-2xl border border-surface-high bg-surface-highest px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleVoice}
              disabled={loading}
              className={[
                'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors',
                listening
                  ? 'border-red-400/50 bg-red-400/10 text-red-300'
                  : 'border-surface-high text-on-surface-variant hover:border-primary/40 hover:text-primary',
              ].join(' ')}
            >
              <Mic className="h-4 w-4" />
              {listening
                ? 'Listening...'
                : 'Voice'}
            </button>

            {loading ? (
              <button
                type="button"
                onClick={stopStreaming}
                className="flex items-center gap-2 rounded-xl border border-red-400/40 bg-red-400/10 px-5 py-2.5 text-sm font-bold text-red-300"
              >
                <Square className="h-4 w-4 fill-current" />
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={!input.trim()}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
              >
                Dispatch
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="mt-5 border-t border-surface-high pt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Try a workflow
            </p>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt.label}
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    handleSubmit(prompt.text)
                  }
                  className="rounded-xl border border-surface-high bg-surface-highest px-3 py-2 text-left text-[11px] text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
                >
                  {prompt.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {planAgents.length > 0 && (
          <section className="rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" />

              <p className="text-xs text-on-surface">
                <span className="font-bold text-primary">
                  Plan:
                </span>{' '}
                {planAgents.join(' → ')}
              </p>
            </div>
          </section>
        )}

        {error && (
          <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
            <div className="flex gap-3">
              <CircleAlert className="h-5 w-5 flex-shrink-0 text-red-300" />
              <p className="text-sm text-red-200">
                {error}
              </p>
            </div>
          </section>
        )}

        {insight && (
          <section className="rounded-3xl border border-yellow-300/30 bg-gradient-to-r from-yellow-300/10 to-transparent p-5">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-yellow-300/15">
                <Zap className="h-5 w-5 text-yellow-300" />
              </div>

              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-300">
                  Learner Insight
                </p>

                <p className="mt-1 text-sm leading-relaxed text-on-surface">
                  {insight}
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-surface-high bg-surface-low p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                Live Agent Trace
              </p>

              <p className="mt-1 text-xs text-on-surface-variant">
                {trace.length} events received
              </p>
            </div>

            {loading && (
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-primary">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                Streaming
              </div>
            )}
          </div>

          {trace.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-surface-high px-4 py-10 text-center">
              <Brain className="mx-auto h-7 w-7 text-on-surface-variant/50" />

              <p className="mt-3 text-sm text-on-surface-variant">
                Dispatch a request to watch the
                network work.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {trace.map((step, index) => {
                const Icon =
                  TYPE_ICONS[step.type] || Brain;

                const color =
                  AGENT_COLORS[step.agent]
                  || 'border-surface-high bg-surface-highest text-on-surface-variant';

                return (
                  <article
                    key={`${step.timestamp}-${index}`}
                    className={`animate-fade-in rounded-2xl border p-4 ${color}`}
                  >
                    <div className="flex gap-3">
                      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold">
                            {step.agent}
                          </span>

                          <span className="font-mono text-[9px] uppercase tracking-wider opacity-60">
                            {step.type}
                          </span>
                        </div>

                        <p className="mt-1 text-sm leading-relaxed text-on-surface">
                          {step.message}
                        </p>

                        {step.tool && (
                          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-black/15 px-2 py-1 font-mono text-[10px]">
                            <Wrench className="h-3 w-3" />
                            {step.tool}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}

              <div ref={traceEndRef} />
            </div>
          )}
        </section>

        {toolOutputs.length > 0 && (
          <section className="rounded-3xl border border-surface-high bg-surface-low p-5">
            <p className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
              Tool Outputs
            </p>

            <div className="space-y-3">
              {toolOutputs.map(
                (output, index) => (
                  <article
                    key={`${output.tool}-${index}`}
                    className="rounded-2xl border border-surface-high bg-surface-highest p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-3.5 w-3.5 text-primary" />

                        <span className="font-mono text-[11px] text-primary">
                          {output.tool}
                        </span>
                      </div>

                      <span className="text-[9px] uppercase tracking-wider text-on-surface-variant">
                        {output.agent}
                      </span>
                    </div>

                    <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed text-on-surface-variant">
                      {JSON.stringify(
                        output.result,
                        null,
                        2,
                      )}
                    </pre>
                  </article>
                ),
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}