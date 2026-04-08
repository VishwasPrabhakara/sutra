import { useState, useEffect } from 'react';
import { BookOpen, Brain, Lightbulb, TrendingUp, Database, Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { getInsights, type PatternStat } from '../api';

const TYPE_EMOJIS: Record<string, string> = {
  scheduler: '📅',
  tasks: '✅',
  scribe: '📝',
  weather: '🌤️',
  routine: '🔕',
  screen: '📱',
  unknown: '❓',
};

function relativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return '';
  }
}

export default function Knowledge() {
  const [currentInsight, setCurrentInsight] = useState<string | null>(null);
  const [patterns, setPatterns] = useState<PatternStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getInsights('vishwas');
      setCurrentInsight(res.current_insight);
      setPatterns(res.patterns);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load knowledge base');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const totalRuns = patterns.reduce((sum, p) => sum + p.count, 0);
  const topPattern = patterns[0];

  return (
    <div className="max-w-6xl mx-auto px-8 py-10 pb-32">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-yellow-300 mb-2">
            Learner Agent · Pattern Detection
          </p>
          <h2 className="font-extrabold text-3xl md:text-4xl tracking-tight">Knowledge Base</h2>
          <p className="text-on-surface-variant mt-2 text-sm">
            Insights the Learner has discovered from your usage patterns. The more you use Sutra, the smarter it gets.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 bg-surface-low hover:bg-surface-high px-4 py-2 rounded-xl border border-surface-high text-[11px] font-mono uppercase tracking-wider transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-tertiary ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Syncing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-300 text-sm mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Hero: Current insight */}
      {currentInsight && (
        <div className="bg-gradient-to-br from-yellow-300/15 via-yellow-300/5 to-transparent rounded-3xl p-8 border border-yellow-300/30 mb-8">
          <div className="flex gap-5">
            <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-yellow-300/20 flex items-center justify-center">
              <Lightbulb className="w-8 h-8 text-yellow-300" />
            </div>
            <div className="flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-yellow-300 mb-2">
                Active Insight · Pattern Detected
              </p>
              <p className="text-on-surface text-lg leading-relaxed">{currentInsight}</p>
              <div className="flex items-center gap-2 mt-4 text-[11px] text-yellow-300/80">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Learned from your last {totalRuns} workflows</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-surface-low p-5 rounded-2xl border border-surface-high">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
              Patterns Learned
            </span>
          </div>
          <div className="font-extrabold text-3xl text-primary">{patterns.length}</div>
        </div>

        <div className="bg-surface-low p-5 rounded-2xl border border-surface-high">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-secondary" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
              Dominant Pattern
            </span>
          </div>
          <div className="font-extrabold text-lg text-secondary capitalize">
            {topPattern ? `${TYPE_EMOJIS[topPattern.request_type] || ''} ${topPattern.request_type}` : '—'}
          </div>
        </div>

        <div className="bg-surface-low p-5 rounded-2xl border border-surface-high">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-tertiary" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
              Total Observations
            </span>
          </div>
          <div className="font-extrabold text-3xl text-tertiary">{totalRuns}</div>
        </div>
      </div>

      {/* Pattern breakdown */}
      <section className="bg-surface-low rounded-[2rem] p-6 border border-surface-high mb-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-extrabold text-lg">Pattern Breakdown</h3>
          <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest">
            by agent category
          </span>
        </div>

        {loading && patterns.length === 0 ? (
          <div className="py-12 text-center text-on-surface-variant text-sm">Analyzing patterns…</div>
        ) : patterns.length === 0 ? (
          <div className="py-12 text-center text-on-surface-variant text-sm">
            No patterns detected yet. Dispatch a few requests from Orchestrate to start learning.
          </div>
        ) : (
          <div className="space-y-3">
            {patterns.map((pattern) => {
              const pct = totalRuns > 0 ? (pattern.count / totalRuns) * 100 : 0;
              const emoji = TYPE_EMOJIS[pattern.request_type] || '•';
              return (
                <div
                  key={pattern.request_type}
                  className="bg-surface-high rounded-2xl p-4 border border-surface-highest"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{emoji}</span>
                      <div>
                        <h4 className="font-bold text-sm capitalize">{pattern.request_type}</h4>
                        <p className="text-[10px] text-on-surface-variant font-mono">
                          last used {relativeTime(pattern.last_used)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-lg text-primary">{pattern.count}</div>
                      <div className="text-[10px] text-on-surface-variant font-mono">
                        {pct.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 bg-surface-lowest rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-tertiary rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* How the Learner works */}
      <section className="bg-surface-lowest rounded-[2rem] p-6 border border-surface-high">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-4 h-4 text-tertiary" />
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant">
            How the Learner Works
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-on-surface-variant">
          <div>
            <div className="font-bold text-on-surface mb-1">1. Every request logged</div>
            <p className="leading-relaxed">Each workflow you dispatch is stored in the <span className="font-mono text-primary">request_history</span> SQLite table with its type, timestamp, and user.</p>
          </div>
          <div>
            <div className="font-bold text-on-surface mb-1">2. Patterns aggregated</div>
            <p className="leading-relaxed">SQL aggregates count usage per agent category and detect repetition patterns (e.g., &ldquo;3+ reschedules this week&rdquo;).</p>
          </div>
          <div>
            <div className="font-bold text-on-surface mb-1">3. Proactive insights</div>
            <p className="leading-relaxed">When thresholds are hit, the Learner injects a suggestion into the next response. No external ML — just deterministic pattern matching.</p>
          </div>
        </div>
      </section>
    </div>
  );
}