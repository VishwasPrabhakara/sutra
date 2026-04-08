import { useState, useEffect } from 'react';
import { Calendar, Clock, CheckCircle2, Tag, RefreshCw, AlertCircle } from 'lucide-react';
import { getEvents, getTasks, type CalendarEvent, type Task } from '../api';

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-300 bg-red-500/10 border-red-500/30',
  medium: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30',
  low: 'text-tertiary bg-tertiary/10 border-tertiary/30',
};

function formatTime(isoString: string): string {
  // Input format from DB: "2026-04-10 14:00"
  try {
    const [datePart, timePart] = isoString.split(' ');
    const [year, month, day] = datePart.split('-');
    const date = new Date(`${year}-${month}-${day}T${timePart || '00:00'}:00`);
    return date.toLocaleString('en-IN', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

function formatTimeShort(isoString: string): string {
  try {
    const [, timePart] = isoString.split(' ');
    return timePart || '—';
  } catch {
    return '—';
  }
}

export default function Schedule() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [eventsRes, tasksRes] = await Promise.all([getEvents(), getTasks()]);
      setEvents(eventsRes.events);
      setTasks(tasksRes.tasks);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const pendingTasks = tasks.filter((t) => t.status === 'pending');

  return (
    <div className="max-w-6xl mx-auto px-8 py-10 pb-32">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-primary mb-2">
            System Status · Live
          </p>
          <h2 className="font-extrabold text-3xl md:text-4xl tracking-tight">Daily Command Hub</h2>
          <p className="text-on-surface-variant mt-2 text-sm">
            Your calendar and tasks, managed by the Scheduler and TaskAgent.
          </p>
        </div>
        <button
          onClick={loadData}
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Timeline column */}
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-surface-low rounded-[2rem] p-6 border border-surface-high">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-extrabold text-lg">Integrated Timeline</h3>
              <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest bg-surface-highest px-3 py-1 rounded-full">
                {events.length} events
              </div>
            </div>

            {loading && events.length === 0 ? (
              <div className="py-12 text-center text-on-surface-variant text-sm">Loading events…</div>
            ) : events.length === 0 ? (
              <div className="py-12 text-center text-on-surface-variant text-sm">No events scheduled.</div>
            ) : (
              <div className="space-y-0 relative">
                <div className="absolute left-[23px] top-0 bottom-0 w-px border-l-2 border-dotted border-on-surface-variant/20"></div>

                {events.map((event, i) => (
                  <div key={event.id} className="relative pl-12 pb-8 last:pb-0">
                    <div className="absolute left-0 top-1 w-12 text-[11px] font-bold text-on-surface-variant/60 font-mono">
                      {formatTimeShort(event.start_time)}
                    </div>
                    <div className="absolute left-[19px] top-2 w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-primary/10"></div>
                    <div className="bg-surface-high p-4 rounded-2xl hover:bg-surface-highest transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-primary uppercase tracking-tighter">
                          {i === 0 ? 'Upcoming' : 'Scheduled'}
                        </span>
                        <Calendar className="w-4 h-4 text-on-surface-variant" />
                      </div>
                      <h4 className="font-semibold text-sm mb-1">{event.title}</h4>
                      <p className="text-on-surface-variant text-xs">{formatTime(event.start_time)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-5 space-y-6">
          {/* Connected sources */}
          <section className="bg-surface-lowest p-5 rounded-[2rem] border border-surface-high">
            <h3 className="font-mono text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-4">
              Integrated Sources · MCP
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-low p-3 rounded-2xl flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                  <Calendar className="text-primary w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] font-bold">Calendar MCP</div>
                  <div className="text-[9px] text-primary">Connected</div>
                </div>
              </div>
              <div className="bg-surface-low p-3 rounded-2xl flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-secondary/10 flex items-center justify-center">
                  <CheckCircle2 className="text-secondary w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] font-bold">Tasks MCP</div>
                  <div className="text-[9px] text-secondary">Connected</div>
                </div>
              </div>
            </div>
          </section>

          {/* Action backlog */}
          <section className="bg-surface-low rounded-[2rem] overflow-hidden border border-surface-high">
            <div className="p-6 border-b border-surface-high flex items-center justify-between">
              <h3 className="font-extrabold text-lg">Action Backlog</h3>
              <span className="text-[10px] font-mono text-primary">{pendingTasks.length} pending</span>
            </div>

            {loading && tasks.length === 0 ? (
              <div className="py-8 text-center text-on-surface-variant text-sm">Loading tasks…</div>
            ) : tasks.length === 0 ? (
              <div className="py-8 text-center text-on-surface-variant text-sm">No tasks yet.</div>
            ) : (
              <div className="divide-y divide-surface-high">
                {tasks.map((task) => {
                  const color = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
                  return (
                    <div key={task.id} className="p-4 hover:bg-surface-high transition-colors">
                      <div className="flex gap-4">
                        <div className="mt-1">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${task.status === 'completed' ? 'border-primary bg-primary/20' : 'border-on-surface-variant'}`}>
                            {task.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-primary" />}
                          </div>
                        </div>
                        <div className="flex-grow">
                          <div className="flex justify-between items-start gap-2">
                            <h4 className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                              {task.title}
                            </h4>
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${color}`}>
                              {task.priority}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="flex items-center gap-1 text-[10px] text-on-surface-variant">
                              <Tag className="w-3 h-3" />
                              {task.status}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-on-surface-variant">
                              <Clock className="w-3 h-3" />
                              #{task.id}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Optimization insight */}
          <div className="bg-gradient-to-br from-yellow-300/10 to-transparent p-6 rounded-[2rem] border-l-4 border-yellow-300/60">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="text-yellow-300 w-4 h-4" />
              <h4 className="font-extrabold text-sm text-yellow-300">Scheduler Insight</h4>
            </div>
            <p className="text-xs text-on-surface leading-relaxed">
              Based on your current calendar, {events.length > 0 ? `your next event is "${events[0].title}"` : 'you have a clear schedule'}. The Scheduler agent is monitoring for conflicts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}