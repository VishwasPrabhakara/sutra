import { useEffect, useState } from 'react';
import {
  CalendarCheck,
  CalendarPlus,
  LoaderCircle,
  LogOut,
  TriangleAlert,
} from 'lucide-react';

import {
  disconnectCalendar,
  getCalendarLoginUrl,
  getCalendarStatus,
  type CalendarConnectionStatus,
} from '../api';

interface ConnectCalendarProps {
  userId?: string;
}

export default function ConnectCalendar({
  userId = 'vishwas',
}: ConnectCalendarProps) {
  const [status, setStatus] =
    useState<CalendarConnectionStatus | null>(null);

  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] =
    useState(false);

  const [error, setError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let mounted = true;

    async function loadStatus() {
      setLoading(true);
      setError(null);

      try {
        const result = await getCalendarStatus(userId);

        if (mounted) {
          setStatus(result);
        }
      } catch (caughtError) {
        if (mounted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : 'Could not load Calendar status',
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadStatus();

    return () => {
      mounted = false;
    };
  }, [userId]);

  const handleConnect = () => {
    window.location.href = getCalendarLoginUrl(userId);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setError(null);

    try {
      await disconnectCalendar(userId);

      setStatus((current) => ({
        provider:
          current?.provider || 'google_calendar',
        configured: current?.configured ?? true,
        connected: false,
      }));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not disconnect Calendar',
      );
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-3xl border border-surface-high bg-surface-low p-5">
        <div className="flex items-center gap-3 text-sm text-on-surface-variant">
          <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
          Checking Google Calendar connection...
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5">
        <div className="flex gap-3">
          <TriangleAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-300" />

          <div>
            <p className="text-sm font-bold text-red-300">
              Calendar status unavailable
            </p>
            <p className="mt-1 text-xs text-red-200/80">
              {error}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!status?.configured) {
    return (
      <section className="rounded-3xl border border-yellow-300/30 bg-yellow-300/10 p-5">
        <div className="flex gap-3">
          <TriangleAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-300" />

          <div>
            <p className="text-sm font-bold text-yellow-300">
              Google OAuth is not configured
            </p>
            <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
              Add the Google client ID, client secret, and
              redirect URI to the backend environment.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (status.connected) {
    return (
      <section className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-400/15">
              <CalendarCheck className="h-5 w-5 text-emerald-300" />
            </div>

            <div>
              <p className="text-sm font-bold text-emerald-300">
                Google Calendar connected
              </p>

              <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                Scheduler reads and updates your primary
                Google Calendar.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-2 rounded-xl border border-surface-high px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
          >
            {disconnecting ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}

            Disconnect
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
          <CalendarPlus className="h-5 w-5 text-primary" />
        </div>

        <div className="flex-1">
          <p className="text-sm font-bold text-on-surface">
            Connect Google Calendar
          </p>

          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            Give Scheduler access to your real events.
            Without it, Sutra uses local demonstration data.
          </p>

          <button
            type="button"
            onClick={handleConnect}
            className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-surface transition-opacity hover:opacity-90"
          >
            <CalendarPlus className="h-4 w-4" />
            Connect Google Calendar
          </button>
        </div>
      </div>
    </section>
  );
}