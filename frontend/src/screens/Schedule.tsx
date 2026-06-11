import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Tag,
} from 'lucide-react';
import {
  useEffect,
  useState,
} from 'react';

import {
  getEvents,
  getGoogleStatus,
  getTasks,
  type CalendarEvent,
  type GoogleConnectionStatus,
  type Task,
} from '../api';

const USER_ID = 'vishwas';

const PRIORITY_COLORS:
  Record<string, string> = {
    high:
      'border-red-500/30 bg-red-500/10 text-red-300',
    medium:
      'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
    low:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  };

export default function Schedule() {
  const [events, setEvents] =
    useState<CalendarEvent[]>([]);

  const [tasks, setTasks] =
    useState<Task[]>([]);

  const [
    googleStatus,
    setGoogleStatus,
  ] =
    useState<GoogleConnectionStatus | null>(
      null,
    );

  const [eventSource, setEventSource] =
    useState<string>('local');

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [
        eventsResponse,
        tasksResponse,
        statusResponse,
      ] = await Promise.all([
        getEvents(USER_ID),
        getTasks(USER_ID),
        getGoogleStatus(USER_ID),
      ]);

      setEvents(
        [...eventsResponse.events].sort(
          (first, second) =>
            parseDate(
              first.start_time,
            ).getTime()
            - parseDate(
              second.start_time,
            ).getTime(),
        ),
      );

      setTasks(tasksResponse.tasks);

      setEventSource(
        eventsResponse.source
        || eventsResponse.events[0]?.source
        || 'local',
      );

      setGoogleStatus(statusResponse);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to load schedule.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const pendingTasks = tasks.filter(
    (task) =>
      task.status === 'pending',
  );

  const nextEvent = events.find(
    (event) =>
      parseDate(
        event.start_time,
      ).getTime() >= Date.now(),
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 pb-32 md:px-8 md:py-10">
      <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Schedule · Live
          </p>

          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            Daily Command Hub
          </h1>

          <p className="mt-2 text-sm text-on-surface-variant">
            Real Google Calendar events and
            your Sutra task backlog.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
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
            ? 'Syncing...'
            : 'Refresh'}
        </button>
      </header>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <section className="rounded-[2rem] border border-surface-high bg-surface-low p-6">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold">
                  Upcoming Events
                </h2>

                <p className="mt-1 text-[10px] font-mono uppercase tracking-wider text-on-surface-variant">
                  Source: {formatSource(
                    eventSource,
                  )}
                </p>
              </div>

              <span className="rounded-full bg-surface-highest px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                {events.length}{' '}
                {events.length === 1
                  ? 'event'
                  : 'events'}
              </span>
            </div>

            {loading
              && events.length === 0 ? (
              <EmptyState message="Loading events..." />
            ) : events.length === 0 ? (
              <EmptyState message="No upcoming events found." />
            ) : (
              <div className="space-y-3">
                {events.map(
                  (event, index) => (
                    <EventCard
                      key={String(
                        event.id,
                      )}
                      event={event}
                      upcoming={
                        nextEvent?.id
                        === event.id
                        || (
                          !nextEvent
                          && index === 0
                        )
                      }
                    />
                  ),
                )}
              </div>
            )}
          </section>

          <SchedulerInsight
            nextEvent={nextEvent}
            eventCount={events.length}
          />
        </div>

        <aside className="space-y-6 lg:col-span-5">
          <ConnectionStatus
            googleStatus={googleStatus}
            eventSource={eventSource}
          />

          <section className="overflow-hidden rounded-[2rem] border border-surface-high bg-surface-low">
            <div className="flex items-center justify-between border-b border-surface-high p-6">
              <div>
                <h2 className="text-lg font-extrabold">
                  Action Backlog
                </h2>

                <p className="mt-1 text-xs text-on-surface-variant">
                  Managed by TaskAgent
                </p>
              </div>

              <span className="font-mono text-[10px] text-primary">
                {pendingTasks.length} pending
              </span>
            </div>

            {loading
              && tasks.length === 0 ? (
              <EmptyState message="Loading tasks..." />
            ) : tasks.length === 0 ? (
              <EmptyState message="No tasks yet." />
            ) : (
              <div className="divide-y divide-surface-high">
                {tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                  />
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function EventCard({
  event,
  upcoming,
}: {
  event: CalendarEvent;
  upcoming: boolean;
}) {
  const start = parseDate(
    event.start_time,
  );

  const end = parseDate(
    event.end_time,
  );

  const eventUrl =
    event.event_url;

  return (
    <article className="rounded-2xl border border-surface-high bg-surface-high p-4 transition-colors hover:bg-surface-highest">
      <div className="flex gap-4">
        <DateBadge date={start} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-primary">
                {upcoming
                  ? 'Next event'
                  : 'Scheduled'}
              </p>

              <h3 className="mt-1 text-sm font-semibold text-on-surface">
                {event.title}
              </h3>
            </div>

            {eventUrl && (
              <a
                href={eventUrl}
                target="_blank"
                rel="noreferrer"
                title="Open in Google Calendar"
                className="flex-shrink-0 text-on-surface-variant transition-colors hover:text-primary"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>

          <p className="mt-2 flex items-center gap-1.5 text-xs text-on-surface-variant">
            <Clock className="h-3.5 w-3.5" />
            {formatTimeRange(
              start,
              end,
            )}
          </p>

          {event.location && (
            <p className="mt-1 truncate text-[10px] text-on-surface-variant">
              {event.location}
            </p>
          )}

          <span className="mt-3 inline-flex rounded-full border border-surface-highest px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-on-surface-variant">
            {formatSource(
              event.source
              || 'local',
            )}
          </span>
        </div>
      </div>
    </article>
  );
}

function DateBadge({
  date,
}: {
  date: Date;
}) {
  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return (
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
        <Calendar className="h-5 w-5 text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-2xl bg-primary/10">
      <span className="text-[9px] font-bold uppercase text-primary">
        {date.toLocaleDateString(
          'en-IN',
          {
            month: 'short',
          },
        )}
      </span>

      <span className="text-lg font-extrabold text-on-surface">
        {date.getDate()}
      </span>
    </div>
  );
}

function TaskCard({
  task,
}: {
  task: Task;
}) {
  const priorityColor =
    PRIORITY_COLORS[
      task.priority
    ]
    || PRIORITY_COLORS.medium;

  const completed =
    task.status === 'completed';

  return (
    <article className="p-4 transition-colors hover:bg-surface-high">
      <div className="flex gap-4">
        <div
          className={[
            'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2',
            completed
              ? 'border-primary bg-primary/20'
              : 'border-on-surface-variant',
          ].join(' ')}
        >
          {completed && (
            <CheckCircle2 className="h-3 w-3 text-primary" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3
              className={[
                'text-sm font-medium',
                completed
                  ? 'text-on-surface-variant line-through'
                  : 'text-on-surface',
              ].join(' ')}
            >
              {task.title}
            </h3>

            <span
              className={`rounded border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${priorityColor}`}
            >
              {task.priority}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <span className="flex items-center gap-1 text-[10px] text-on-surface-variant">
              <Tag className="h-3 w-3" />
              {task.status}
            </span>

            <span className="font-mono text-[10px] text-on-surface-variant">
              #{task.id}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function ConnectionStatus({
  googleStatus,
  eventSource,
}: {
  googleStatus:
    GoogleConnectionStatus | null;
  eventSource: string;
}) {
  return (
    <section className="rounded-[2rem] border border-surface-high bg-surface-lowest p-5">
      <h2 className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
        Connected Sources
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <SourceCard
          icon={Calendar}
          label="Google Calendar"
          connected={
            Boolean(
              googleStatus
                ?.calendar_connected,
            )
          }
          detail={
            eventSource === 'google'
              ? 'Live events'
              : 'Local fallback'
          }
        />

        <SourceCard
          icon={CheckCircle2}
          label="Sutra Tasks"
          connected
          detail="SQLite"
        />
      </div>
    </section>
  );
}

function SourceCard({
  icon: Icon,
  label,
  connected,
  detail,
}: {
  icon: typeof Calendar;
  label: string;
  connected: boolean;
  detail: string;
}) {
  return (
    <div className="rounded-2xl bg-surface-low p-3">
      <div
        className={[
          'flex h-8 w-8 items-center justify-center rounded-xl',
          connected
            ? 'bg-primary/10'
            : 'bg-yellow-300/10',
        ].join(' ')}
      >
        <Icon
          className={[
            'h-4 w-4',
            connected
              ? 'text-primary'
              : 'text-yellow-300',
          ].join(' ')}
        />
      </div>

      <p className="mt-3 text-[10px] font-bold text-on-surface">
        {label}
      </p>

      <p
        className={[
          'mt-0.5 text-[9px]',
          connected
            ? 'text-primary'
            : 'text-yellow-300',
        ].join(' ')}
      >
        {connected
          ? 'Connected'
          : 'Fallback'}
        {' · '}
        {detail}
      </p>
    </div>
  );
}

function SchedulerInsight({
  nextEvent,
  eventCount,
}: {
  nextEvent:
    CalendarEvent | undefined;
  eventCount: number;
}) {
  return (
    <section className="rounded-[2rem] border-l-4 border-yellow-300/60 bg-gradient-to-br from-yellow-300/10 to-transparent p-6">
      <div className="mb-3 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-yellow-300" />

        <h2 className="text-sm font-extrabold text-yellow-300">
          Scheduler Insight
        </h2>
      </div>

      <p className="text-xs leading-relaxed text-on-surface">
        {nextEvent
          ? (
              `Your next event is "${nextEvent.title}" `
              + `on ${formatDateTime(
                parseDate(
                  nextEvent.start_time,
                ),
              )}.`
            )
          : eventCount > 0
            ? (
                'No future events remain '
                + 'in the current result.'
              )
            : (
                'Your upcoming calendar '
                + 'is currently clear.'
              )}
      </p>
    </section>
  );
}

function EmptyState({
  message,
}: {
  message: string;
}) {
  return (
    <div className="px-4 py-12 text-center text-sm text-on-surface-variant">
      {message}
    </div>
  );
}

function parseDate(
  value: string,
): Date {
  if (!value) {
    return new Date(
      Number.NaN,
    );
  }

  const normalized =
    value.includes('T')
      ? value
      : value.replace(
          ' ',
          'T',
        );

  return new Date(normalized);
}

function formatDateTime(
  date: Date,
): string {
  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return 'Unknown time';
  }

  return date.toLocaleString(
    'en-IN',
    {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    },
  );
}

function formatTimeRange(
  start: Date,
  end: Date,
): string {
  if (
    Number.isNaN(
      start.getTime(),
    )
  ) {
    return 'Unknown time';
  }

  const startDateText =
    start.toLocaleString(
      'en-IN',
      {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      },
    );

  if (
    Number.isNaN(
      end.getTime(),
    )
  ) {
    return startDateText;
  }

  const endText =
    end.toLocaleTimeString(
      'en-IN',
      {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      },
    );

  return `${startDateText} – ${endText}`;
}

function formatSource(
  source: string,
): string {
  if (
    source.toLowerCase()
      === 'google'
  ) {
    return 'Google Calendar';
  }

  return 'Local fallback';
}