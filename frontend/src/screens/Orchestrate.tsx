import { useState, useRef, useEffect } from 'react';
import { Brain, Send, Sparkles, Cpu, Wrench, CheckCircle2, Lightbulb, Mic, Zap } from 'lucide-react';
import { orchestrate, type TraceStep, type OrchestrateResponse } from '../api';

// Web Speech API type shim
interface SpeechRecognitionEvent extends Event {
  results: {
    [key: number]: { [key: number]: { transcript: string } };
    length: number;
  };
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}
declare global {
  interface Window {
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
    SpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

const AGENT_COLORS: Record<string, string> = {
  Orchestrator: 'text-primary border-primary/40 bg-primary/5',
  Scheduler: 'text-secondary border-secondary/40 bg-secondary/5',
  Scribe: 'text-tertiary border-tertiary/40 bg-tertiary/5',
  TaskAgent: 'text-tertiary border-tertiary/40 bg-tertiary/5',
  WeatherAgent: 'text-blue-300 border-blue-300/40 bg-blue-300/5',
  RoutineAgent: 'text-pink-300 border-pink-300/40 bg-pink-300/5',
  ScreenAgent: 'text-orange-300 border-orange-300/40 bg-orange-300/5',
  Learner: 'text-yellow-300 border-yellow-300/40 bg-yellow-300/5',
};

const TYPE_ICONS: Record<string, typeof Brain> = {
  thinking: Brain,
  plan: Cpu,
  tool_call: Wrench,
  tool_result: CheckCircle2,
  complete: CheckCircle2,
  insight: Lightbulb,
  final: Sparkles,
};

const QUICK_PROMPTS = [
  { label: '🇮🇳 Hinglish', text: "Friday meri sprint demo hai but mom is flying in from Chennai. Sort it out." },
  { label: '📅 Calendar', text: "What's on my calendar this week and what tasks do I have pending?" },
  { label: '📨 Multi-tool', text: "Draft a message to Marcus about the Q4 deck and add it to my tasks." },
  { label: '🌤️ Weather', text: "I have an outdoor team offsite tomorrow, check the weather and reschedule if needed." },
  { label: '🔕 Focus', text: "I need 2 hours of deep work, activate focus mode and block my calendar." },
  { label: '📱 Screen Scan', text: "Check my WhatsApp for any schedule updates and update my calendar." },
];

export default function Orchestrate() {
  const [input, setInput] = useState('');
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [insight, setInsight] = useState<string | null>(null);
  const [response, setResponse] = useState<OrchestrateResponse | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const traceEndRef = useRef<HTMLDivElement>(null);

  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const handleVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice input requires Chrome or Edge browser.');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setListening(false);
    };
    recognition.onerror = () => {
      setError('Voice recognition failed. Try again or type your request.');
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  useEffect(() => {
    if (visibleCount >= trace.length) return;
    const timer = setTimeout(() => setVisibleCount((c) => c + 1), 700);
    return () => clearTimeout(timer);
  }, [visibleCount, trace.length]);

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleCount]);

  const handleSubmit = async (overrideInput?: string) => {
    const requestText = overrideInput ?? input;
    if (!requestText.trim() || loading) return;
    setLoading(true);
    setError(null);
    setTrace([]);
    setInsight(null);
    setResponse(null);
    setVisibleCount(0);
    try {
      const res = await orchestrate(requestText);
      setTrace(res.trace);
      setInsight(res.insight);
      setResponse(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const visibleTrace = trace.slice(0, visibleCount);
  const activeAgents = new Set(visibleTrace.map((s) => s.agent));
  const showInsight = insight && visibleCount >= trace.length;

  const ALL_AGENTS = ['Orchestrator', 'Scheduler', 'TaskAgent', 'Scribe', 'WeatherAgent', 'RoutineAgent', 'ScreenAgent', 'Learner'];

  return (
    <div className="max-w-6xl mx-auto px-8 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Left: Agent roster */}
      <aside className="lg:col-span-4 space-y-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant">
          Agent Roster
        </h2>
        {ALL_AGENTS.map((agent) => {
          const isActive = activeAgents.has(agent);
          const color = AGENT_COLORS[agent] || 'text-on-surface-variant border-on-surface-variant/20 bg-surface-low';
          return (
            <div
              key={agent}
              className={`p-3 rounded-2xl border transition-all ${color} ${
                isActive ? 'scale-[1.02] shadow-lg' : 'opacity-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs">{agent}</span>
                {isActive && <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>}
              </div>
              <p className="text-[9px] uppercase tracking-wider mt-0.5 opacity-70">
                {isActive ? 'Active' : 'Standby'}
              </p>
            </div>
          );
        })}

        <div className="mt-4 p-4 rounded-2xl bg-surface-low border border-surface-high">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant mb-3">
            Session Stats
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-on-surface-variant">Trace steps</span>
              <span className="font-mono text-primary">{visibleCount}/{trace.length}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-on-surface-variant">Active agents</span>
              <span className="font-mono text-primary">{activeAgents.size}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-on-surface-variant">Tools called</span>
              <span className="font-mono text-primary">
                {visibleTrace.filter((s) => s.type === 'tool_call').length}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Right: Input + Trace */}
      <section className="lg:col-span-8 space-y-6">
        <div className="bg-surface-low rounded-3xl p-6 border border-surface-high">
          <label className="font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant block mb-3">
            Your Request
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type or speak your request — Hinglish, English, anything goes."
            rows={3}
            className="w-full bg-surface-highest rounded-2xl px-4 py-3 text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
          />
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={handleVoice}
              className={`flex items-center gap-2 text-[11px] px-3 py-2 rounded-xl border transition-all ${
                listening
                  ? 'bg-red-500/20 border-red-500/50 text-red-300 animate-pulse'
                  : 'text-on-surface-variant border-surface-high hover:border-primary/40 hover:text-primary'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              {listening ? 'Listening…' : 'Voice'}
            </button>
            <button
              onClick={() => handleSubmit()}
              disabled={loading || !input.trim()}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed text-surface font-bold text-sm px-5 py-2.5 rounded-xl transition-all"
            >
              {loading ? 'Orchestrating…' : 'Dispatch'}
              <Send className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-surface-high">
            <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-2">
              Try a demo prompt
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {QUICK_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(prompt.text);
                    handleSubmit(prompt.text);
                  }}
                  disabled={loading}
                  className="text-[11px] px-3 py-2 rounded-lg bg-surface-highest border border-surface-high text-on-surface-variant hover:text-primary hover:border-primary/40 transition-all disabled:opacity-30 text-left"
                >
                  {prompt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {showInsight && (
          <div className="bg-gradient-to-r from-yellow-300/10 via-yellow-300/5 to-transparent rounded-3xl p-6 border border-yellow-300/30 animate-fade-in">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-yellow-300/20 flex items-center justify-center">
                <Zap className="w-6 h-6 text-yellow-300" />
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-yellow-300 mb-1">
                  Learner Insight · Pattern Detected
                </p>
                <p className="text-on-surface text-sm leading-relaxed">{insight}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {visibleTrace.length > 0 && (
          <div className="bg-surface-low rounded-3xl p-6 border border-surface-high">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant">
                Live Agent Trace
              </h3>
              <span className="text-[10px] font-mono text-primary">
                {visibleCount}/{trace.length} steps
              </span>
            </div>
            <div className="space-y-3">
              {visibleTrace.map((step, i) => {
                const Icon = TYPE_ICONS[step.type] || Brain;
                const color = AGENT_COLORS[step.agent] || 'text-on-surface-variant border-on-surface-variant/20 bg-surface-low';
                return (
                  <div key={i} className={`flex gap-3 p-3 rounded-2xl border animate-fade-in ${color}`}>
                    <div className="flex-shrink-0 mt-0.5">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-xs">{step.agent}</span>
                        <span className="text-[9px] font-mono uppercase tracking-wider opacity-60">
                          {step.type}
                        </span>
                      </div>
                      <p className="text-sm text-on-surface leading-snug">{step.message}</p>
                      {step.tool && (
                        <div className="mt-2 inline-block px-2 py-0.5 rounded bg-surface-highest text-[10px] font-mono text-on-surface-variant">
                          tool: {step.tool}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={traceEndRef} />
            </div>
          </div>
        )}

        {response && visibleCount >= trace.length && response.results.some((r) => r.tool_results.length > 0) && (
          <div className="bg-surface-low rounded-3xl p-6 border border-surface-high animate-fade-in">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant mb-4">
              Tool Outputs
            </h3>
            <div className="space-y-3">
              {response.results.map((r, i) =>
                r.tool_results.map((tr, j) => (
                  <div key={`${i}-${j}`} className="bg-surface-highest rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Wrench className="w-3.5 h-3.5 text-primary" />
                      <span className="font-mono text-[11px] text-primary">{tr.tool}</span>
                    </div>
                    <pre className="text-[11px] text-on-surface-variant overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(tr.result, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}