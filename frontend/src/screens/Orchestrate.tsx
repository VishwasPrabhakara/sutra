import {
  CircleAlert,
  Cpu,
  Database,
  Mic,
  Send,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import {
  clearConversation,
  getConversation,
  streamOrchestration,
  type ConversationMessage,
  type OrchestrateResponse,
  type TraceStep,
} from '../api';
import AgentNetworkGraph from '../components/AgentNetworkGraph';
import ChatResponse from '../components/ChatResponse';
import CompactTrace from '../components/CompactTrace';
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

interface SpeechRecognitionInstance extends EventTarget {
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

import { getUserId } from '../user';

const USER_ID = getUserId();

const QUICK_PROMPTS = [
  {
    label: 'Calendar + weather',
    text:
      "Check tomorrow's weather in Bengaluru "
      + 'and show my calendar.',
  },
  {
    label: 'Create event',
    text:
      'Create a calendar event tomorrow at '
      + '3 PM for project planning.',
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
      'Create a high priority task to send '
      + 'the Q4 deck and draft a message to Marcus.',
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
  const [trace, setTrace] =
    useState<TraceStep[]>([]);

  const [response, setResponse] =
    useState<OrchestrateResponse | null>(null);

  const [conversation, setConversation] =
    useState<ConversationMessage[]>([]);

  const [currentRequest, setCurrentRequest] =
    useState('');

  const [planAgents, setPlanAgents] =
    useState<string[]>([]);

  const [tokenCount, setTokenCount] =
    useState(0);

  const [cached, setCached] =
    useState(false);

  const [demoMode, setDemoMode] =
    useState(false);

  const [voiceOutput, setVoiceOutput] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [
    loadingConversation,
    setLoadingConversation,
  ] = useState(true);

  const [listening, setListening] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const abortControllerRef =
    useRef<AbortController | null>(null);

  const recognitionRef =
    useRef<SpeechRecognitionInstance | null>(
      null,
    );

  const conversationEndRef =
    useRef<HTMLDivElement | null>(null);

  const inputRef =
    useRef<HTMLTextAreaElement | null>(null);

  const loadConversation = async () => {
    setLoadingConversation(true);

    try {
      const result = await getConversation(
        USER_ID,
        5,
      );

      setConversation(result.messages);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not load conversation.',
      );
    } finally {
      setLoadingConversation(false);
    }
  };

  useEffect(() => {
    loadConversation();

    const params = new URLSearchParams(
      window.location.search,
    );

    if (
      params.has('google')
      || params.has('calendar')
    ) {
      params.delete('google');
      params.delete('calendar');

      const query = params.toString();

      window.history.replaceState(
        {},
        '',
        window.location.pathname
          + (query ? `?${query}` : ''),
      );
    }
  }, []);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [
    conversation,
    response,
    trace.length,
    currentRequest,
  ]);

  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus();
    }
  }, [loading, response]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const handleClearConversation = async () => {
    if (loading) {
      return;
    }

    try {
      await clearConversation(USER_ID);

      window.speechSynthesis?.cancel();

      setConversation([]);
      setCurrentRequest('');
      setResponse(null);
      setTrace([]);
      setPlanAgents([]);
      setTokenCount(0);
      setCached(false);
      setError(null);
      setInput('');
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not clear conversation.',
      );
    }
  };

  const handleVoiceInput = () => {
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

    setError(null);

    const recognition = new Recognition();

    recognition.lang = 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      setInput(
        event.results[0][0].transcript,
      );
    };

    recognition.onerror = () => {
      setError('Voice recognition failed.');
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const speakResponse = (
    message: string,
  ) => {
    if (
      !voiceOutput
      || !('speechSynthesis' in window)
      || !message.trim()
    ) {
      return;
    }

    window.speechSynthesis.cancel();

    const utterance =
      new SpeechSynthesisUtterance(
        stripMarkdown(message),
      );

    utterance.lang = 'en-IN';
    utterance.rate = 1;
    utterance.pitch = 1;

    window.speechSynthesis.speak(
      utterance,
    );
  };

  const toggleVoiceOutput = () => {
    setVoiceOutput((current) => {
      const next = !current;

      if (!next) {
        window.speechSynthesis?.cancel();
      }

      return next;
    });
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
      (overrideInput ?? input).trim();

    if (!requestText || loading) {
      return;
    }

    const controller =
      new AbortController();

    abortControllerRef.current =
      controller;

    window.speechSynthesis?.cancel();

    setInput('');
    setCurrentRequest(requestText);
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
          onTrace: (
            step,
            tokens,
          ) => {
            setTrace((current) => [
              ...current,
              step,
            ]);

            setTokenCount(tokens);
          },

          onPlan: (
            plan,
            step,
            tokens,
          ) => {
            setPlanAgents(
              plan.agents_needed,
            );

            setTrace((current) => [
              ...current,
              step,
            ]);

            setTokenCount(tokens);
          },

          onComplete: (
            result,
            tokens,
            wasCached,
          ) => {
            setResponse(result);
            setTokenCount(tokens);

            setCached(
              wasCached
              || result.cached,
            );

            speakResponse(
              result.final_message,
            );
          },

          onError: (
            streamError,
          ) => {
            setError(
              streamError.message,
            );
          },
        },
        USER_ID,
        controller.signal,
        demoMode,
      );

      await loadConversation();
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
      KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      event.key === 'Enter'
      && !event.shiftKey
    ) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const insight =
    response?.insight
    || [...trace]
      .reverse()
      .find(
        (step) =>
          step.type === 'insight',
      )
      ?.message;

  const previousMessages =
    response
      ? conversation.slice(0, -2)
      : conversation;

  const hasConversation =
    previousMessages.length > 0
    || Boolean(currentRequest)
    || Boolean(response);

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

      <main className="min-w-0 space-y-5 xl:col-span-7">
        <section className="rounded-3xl border border-surface-high bg-surface-low p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                Multi-Turn Chief of Staff
              </p>

              <h1 className="mt-2 text-2xl font-extrabold tracking-tight md:text-3xl">
                Conversation with Sutra
              </h1>

              <p className="mt-2 text-sm text-on-surface-variant">
                Sutra remembers your last five
                turns and understands follow-ups.
              </p>
            </div>

            <button
              type="button"
              onClick={
                handleClearConversation
              }
              disabled={
                loading
                || conversation.length === 0
              }
              className="flex flex-shrink-0 items-center gap-2 rounded-xl border border-surface-high px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:border-red-400/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        </section>

        <section className="space-y-4">
          {loadingConversation
            && conversation.length === 0 && (
            <p className="py-8 text-center text-xs text-on-surface-variant">
              Loading conversation...
            </p>
          )}

          {!loadingConversation
            && !hasConversation && (
            <EmptyConversation
              onPrompt={handleSubmit}
              disabled={loading}
            />
          )}

          {previousMessages.map(
            (message) => (
              <ConversationBubble
                key={message.id}
                message={message}
              />
            ),
          )}

          {currentRequest && (
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-primary px-5 py-3 text-sm leading-relaxed text-surface">
                {currentRequest}
              </div>
            </div>
          )}

          {planAgents.length > 0
            && loading && (
            <section className="rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 flex-shrink-0 text-primary" />

                <p className="text-xs text-on-surface">
                  <span className="font-bold text-primary">
                    Working with:
                  </span>{' '}

                  {planAgents.join(', ')}
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

          {response && (
            <ChatResponse
              response={response}
              loading={loading}
            />
          )}

          <div ref={conversationEndRef} />
        </section>

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

        <CompactTrace
          trace={trace}
          loading={loading}
        />

        <section className="sticky bottom-20 z-30 rounded-3xl border border-surface-high bg-surface/95 p-4 shadow-2xl backdrop-blur-xl">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) =>
              setInput(event.target.value)
            }
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder={
              hasConversation
                ? 'Ask a follow-up...'
                : 'Ask in English or Hinglish...'
            }
            rows={2}
            className="w-full resize-none rounded-2xl border border-surface-high bg-surface-highest px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleVoiceInput}
                disabled={loading}
                title="Voice input"
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

              <button
                type="button"
                onClick={toggleVoiceOutput}
                title="Toggle spoken replies"
                className={[
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors',
                  voiceOutput
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-surface-high text-on-surface-variant hover:border-primary/40 hover:text-primary',
                ].join(' ')}
              >
                {voiceOutput ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}

                Speak
              </button>

              <button
                type="button"
                onClick={() =>
                  setDemoMode(
                    (current) =>
                      !current,
                  )
                }
                disabled={loading}
                title="Use cached demo responses"
                className={[
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors',
                  demoMode
                    ? 'border-yellow-300/40 bg-yellow-300/10 text-yellow-300'
                    : 'border-surface-high text-on-surface-variant hover:border-yellow-300/40 hover:text-yellow-300',
                ].join(' ')}
              >
                <Database className="h-4 w-4" />
                Demo
              </button>
            </div>

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
                onClick={() =>
                  handleSubmit()
                }
                disabled={!input.trim()}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
              >
                Send
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function EmptyConversation({
  onPrompt,
  disabled,
}: {
  onPrompt: (
    prompt: string,
  ) => void;
  disabled: boolean;
}) {
  return (
    <section className="rounded-3xl border border-dashed border-surface-high bg-surface-low/50 p-6">
      <div className="text-center">
        <h2 className="text-xl font-extrabold">
          What should Sutra handle?
        </h2>

        <p className="mt-2 text-sm text-on-surface-variant">
          Start a workflow or ask a question.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-3">
        {QUICK_PROMPTS.map(
          (prompt) => (
            <button
              key={prompt.label}
              type="button"
              disabled={disabled}
              onClick={() =>
                onPrompt(prompt.text)
              }
              className="rounded-xl border border-surface-high bg-surface-highest px-3 py-2 text-left text-[11px] text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
            >
              {prompt.label}
            </button>
          ),
        )}
      </div>
    </section>
  );
}

function ConversationBubble({
  message,
}: {
  message: ConversationMessage;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-primary px-5 py-3 text-sm leading-relaxed text-surface">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-3xl rounded-bl-lg border border-surface-high bg-surface-low px-5 py-4">
        <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-primary">
          Sutra
        </p>

        <p className="whitespace-pre-wrap text-sm leading-7 text-on-surface">
          {stripMarkdown(
            message.content,
          )}
        </p>
      </div>
    </div>
  );
}

function stripMarkdown(
  value: string,
): string {
  return value
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/gm, '')
    .trim();
}
