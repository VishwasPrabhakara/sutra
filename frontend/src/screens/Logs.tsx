import { useState, useEffect } from 'react';
import { ScrollText, RefreshCw, Brain, Clock, AlertCircle, Activity } from 'lucide-react';
import { getHistory, type HistoryEntry } from '../api';

const TYPE_COLORS: Record<string, string> = {
  scheduler: 'text-secondary border-secondary/40 bg-secondary/5',
  tasks: 'text-tertiary border-tertiary/40 bg-tertiary/5',
  scribe: 'text-primary border-primary/40 bg-primary/5',
  weather: 'text-blue-300 border-blue-300/40 bg-blue-300/5',
  routine: 'text-pink-300 border-pink-300/40 bg-pink-300/5',
  screen: 'text-orange-300 border-orange-300/40 bg-orange-300/5',
  unknown: 'text-on-surface-variant border-on-surface-variant/20 bg-surface-low',
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

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

export default function Logs() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getHistory('vishwas', 50);
      setHistory(res.history);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Stats
  const totalRuns = history.length;
  const byType = history.reduce((acc, h) => {
    acc[h.request_type] = (acc[h.request_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const mostUsed = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="max-w-6xl mx-auto px-8 py-10 pb-32">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-secondary mb-2">
            Execution History · Persistent
          </p>
          <h2 className="font-extrabold text-3xl md:text-4xl tracking-tight">Agent Workflow Logs</h2>
          <p className="text-on-surface-variant mt-2 text-sm">
            Every request ever dispatched, persisted in SQLite and used by the Learner for pattern detection.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 bg-surface-low hover:bg-surface-high px-4 py-2 rounded-xl border border-surface-high text-[11px] font-mono uppercase tracking-wider transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-tertiary ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-300 text-sm mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-surface-low p-5 rounded-2xl border border-surface-high">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
              Total Runs
            </span>
          </div>
          <div className="font-extrabold text-3xl text-primary">{totalRuns}</div>
        </div>

        <div className="bg-surface-low p-5 rounded-2xl border border-surface-high">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-secondary" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
              Most-used Agent
            </span>
          </div>
          <div className="font-extrabold text-xl text-secondary capitalize">
            {mostUsed ? `${mostUsed[0]} (${mostUsed[1]})` : '—'}
          </div>
        </div>

        <div className="bg-surface-low p-5 rounded-2xl border border-surface-high">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-tertiary" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
              Last Activity
            </span>
          </div>
          <div className="font-extrabold text-lg text-tertiary">
            {history[0] ? relativeTime(history[0].created_at) : '—'}
          </div>
        </div>
      </div>

      {/* History timeline */}
      <section className="bg-surface-low rounded-[2rem] p-6 border border-surface-high">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-extrabold text-lg">Workflow Stream</h3>
          <span className="text-[10px] font-mono text-on-surface-variant">
            showing {history.length} of {history.length}
          </span>
        </div>

        {loading && history.length === 0 ? (
          <div className="py-12 text-center text-on-surface-variant text-sm">Loading history…</div>
        ) : history.length === 0 ? (
          <div className="py-12 text-center text-on-surface-variant text-sm">
            No workflows yet. Head to Orchestrate and dispatch a request.
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((entry) => {
              const color = TYPE_COLORS[entry.request_type] || TYPE_COLORS.unknown;
              return (
                <div
                  key={entry.id}
                  className={`group p-4 rounded-2xl border transition-all ${color}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <ScrollText className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="font-mono text-[9px] uppercase tracking-widest font-bold">
                          {entry.request_type}
                        </span>
                        <span className="text-[9px] font-mono opacity-60">#{entry.id}</span>
                      </div>
                      <p className="text-sm text-on-surface leading-snug truncate">
                        {entry.request_text}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[10px] font-mono text-on-surface-variant">
                        {formatTime(entry.created_at)}
                      </div>
                      <div className="text-[9px] text-on-surface-variant/60 mt-0.5">
                        {relativeTime(entry.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}