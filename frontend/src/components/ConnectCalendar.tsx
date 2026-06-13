import {
  CalendarCheck,
  CalendarPlus,
  LoaderCircle,
  LogOut,
  Mail,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import {
  useEffect,
  useState,
} from 'react';

import {
  disconnectGoogle,
  getGoogleLoginUrl,
  getGoogleStatus,
  type GoogleConnectionStatus,
} from '../api';

interface ConnectCalendarProps {
  userId?: string;
}

export default function ConnectCalendar({
  userId = getUserId(),
}: ConnectCalendarProps) {
  const [status, setStatus] =
    useState<GoogleConnectionStatus | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [
    disconnecting,
    setDisconnecting,
  ] = useState(false);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadStatus() {
      setLoading(true);
      setError(null);

      try {
        const result =
          await getGoogleStatus(userId);

        if (mounted) {
          setStatus(result);
        }
      } catch (caughtError) {
        if (mounted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : (
                  'Could not load Google '
                  + 'connection status'
                ),
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
    window.location.href =
      getGoogleLoginUrl(userId);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setError(null);

    try {
      await disconnectGoogle(userId);

      setStatus({
        provider: 'google_workspace',
        configured:
          status?.configured ?? true,
        connected: false,
        calendar_connected: false,
        gmail_connected: false,
        requires_reconnect: false,
        scopes: [],
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : (
              'Could not disconnect '
              + 'Google Workspace'
            ),
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
          Checking Google Workspace...
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
              Google connection unavailable
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
              Add the Google client ID, client
              secret, and redirect URI to the
              backend environment.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (status.requires_reconnect) {
    return (
      <section className="rounded-3xl border border-yellow-300/30 bg-yellow-300/10 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-yellow-300/15">
            <RefreshCw className="h-5 w-5 text-yellow-300" />
          </div>

          <div className="flex-1">
            <p className="text-sm font-bold text-yellow-300">
              Reconnect Google Workspace
            </p>

            <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
              Calendar is connected, but Gmail
              sending permission is missing.
              Reconnect to approve both services.
            </p>

            <button
              type="button"
              onClick={handleConnect}
              className="mt-4 flex items-center gap-2 rounded-xl bg-yellow-300 px-4 py-2.5 text-xs font-bold text-surface transition-opacity hover:opacity-90"
            >
              <RefreshCw className="h-4 w-4" />
              Reconnect Google
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (
    status.calendar_connected
    || status.gmail_connected
  ) {
    return (
      <section className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-emerald-300">
              Google Workspace connected
            </p>

            <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
              Sutra can use the approved Google
              services for this account.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <ServiceStatus
                icon={CalendarCheck}
                label="Calendar"
                connected={
                  status.calendar_connected
                }
              />

              <ServiceStatus
                icon={Mail}
                label="Gmail send"
                connected={
                  status.gmail_connected
                }
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex flex-shrink-0 items-center gap-2 rounded-xl border border-surface-high px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
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
            Connect Google Workspace
          </p>

          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            Connect Calendar for real scheduling
            and Gmail for confirmed email sending.
          </p>

          <button
            type="button"
            onClick={handleConnect}
            className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-surface transition-opacity hover:opacity-90"
          >
            <CalendarPlus className="h-4 w-4" />
            Connect Google
          </button>
        </div>
      </div>
    </section>
  );
}

function ServiceStatus({
  icon: Icon,
  label,
  connected,
}: {
  icon: typeof CalendarCheck;
  label: string;
  connected: boolean;
}) {
  return (
    <div className="rounded-xl border border-emerald-400/20 bg-black/10 px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon
          className={[
            'h-3.5 w-3.5',
            connected
              ? 'text-emerald-300'
              : 'text-on-surface-variant',
          ].join(' ')}
        />

        <span className="text-[10px] font-bold text-on-surface">
          {label}
        </span>
      </div>

      <p
        className={[
          'mt-1 font-mono text-[8px] uppercase tracking-wider',
          connected
            ? 'text-emerald-300'
            : 'text-yellow-300',
        ].join(' ')}
      >
        {connected
          ? 'Connected'
          : 'Not approved'}
      </p>
    </div>
  );
}
import { getUserId } from '../user';
