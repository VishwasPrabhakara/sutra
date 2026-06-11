import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudRain,
  ExternalLink,
  LoaderCircle,
  Mail,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import {
  useMemo,
  useState,
} from 'react';

import {
  cancelAction,
  confirmAction,
  type OrchestrateResponse,
} from '../api';

interface ChatResponseProps {
  response: OrchestrateResponse;
  loading: boolean;
}

interface ToolOutput {
  agent: string;
  tool: string;
  result: Record<string, unknown>;
}

export default function ChatResponse({
  response,
  loading,
}: ChatResponseProps) {
  const [showDetails, setShowDetails] =
    useState(false);

  const toolOutputs = useMemo(
    () =>
      response.results.flatMap(
        (agentResult) =>
          agentResult.tool_results.map(
            (toolResult) => ({
              agent: agentResult.agent,
              tool: toolResult.tool,
              result: asRecord(
                toolResult.result,
              ),
            }),
          ),
      ),
    [response],
  );

  const finalMessage =
    response.final_message
    || findFinalMessage(response)
    || 'I completed your request.';

  return (
    <section className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/5 via-surface-low to-surface-low p-5">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              Sutra
            </p>

            {response.cached && (
              <span className="rounded-full border border-yellow-300/30 bg-yellow-300/10 px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-yellow-300">
                Demo cache
              </span>
            )}
          </div>

          <div className="mt-2 space-y-3 text-sm leading-7 text-on-surface">
            <FormattedMessage
              content={finalMessage}
            />
          </div>
        </div>
      </header>

      {loading && (
        <div className="mt-4 flex items-center gap-2 border-t border-surface-high pt-4 text-xs text-on-surface-variant">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" />
          Sutra is still working...
        </div>
      )}

      {toolOutputs.length > 0 && (
        <div className="mt-5 border-t border-surface-high pt-4">
          <button
            type="button"
            onClick={() =>
              setShowDetails((current) => !current)
            }
            className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-xs font-bold text-on-surface-variant transition-colors hover:text-primary"
          >
            <span>
              {showDetails
                ? 'Hide supporting details'
                : 'Show supporting details'}
            </span>

            {showDetails ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {showDetails && (
            <div className="mt-3 space-y-3">
              {toolOutputs.map(
                (output, index) => (
                  <ToolDetail
                    key={`${output.tool}-${index}`}
                    output={output}
                  />
                ),
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FormattedMessage({
  content,
}: {
  content: string;
}) {
  const blocks = content
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean);

  return (
    <>
      {blocks.map((block, index) => {
        const lines = block
          .split('\n')
          .filter(Boolean);

        if (
          lines.length === 1
          && isHeading(lines[0])
        ) {
          return (
            <h3
              key={index}
              className="pt-1 text-sm font-bold text-primary"
            >
              {stripMarkdown(lines[0])}
            </h3>
          );
        }

        if (
          lines.every(
            (line) =>
              line.trim().startsWith('- ')
              || line.trim().startsWith('* '),
          )
        ) {
          return (
            <ul
              key={index}
              className="space-y-1 pl-5"
            >
              {lines.map((line, lineIndex) => (
                <li
                  key={lineIndex}
                  className="list-disc"
                >
                  <InlineText
                    content={line
                      .trim()
                      .slice(2)}
                  />
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index}>
            {lines.map(
              (line, lineIndex) => (
                <span key={lineIndex}>
                  <InlineText
                    content={line}
                  />

                  {lineIndex
                    < lines.length - 1 && (
                    <br />
                  )}
                </span>
              ),
            )}
          </p>
        );
      })}
    </>
  );
}

function InlineText({
  content,
}: {
  content: string;
}) {
  const parts = content.split(
    /(\*\*[^*]+\*\*)/g,
  );

  return (
    <>
      {parts.map((part, index) => {
        if (
          part.startsWith('**')
          && part.endsWith('**')
        ) {
          return (
            <strong
              key={index}
              className="font-bold text-on-surface"
            >
              {part.slice(2, -2)}
            </strong>
          );
        }

        return part;
      })}
    </>
  );
}

function ToolDetail({
  output,
}: {
  output: ToolOutput;
}) {
  if (
    output.tool === 'prepare_email'
  ) {
    return (
      <EmailConfirmation
        result={output.result}
      />
    );
  }

  if (
    output.tool === 'get_calendar_events'
  ) {
    return (
      <CalendarDetails
        result={output.result}
      />
    );
  }

  if (output.tool === 'create_event') {
    return (
      <ActionDetail
        icon={CalendarDays}
        title="Calendar event"
        result={output.result}
      />
    );
  }

  if (
    output.tool === 'get_weather'
  ) {
    return (
      <WeatherDetails
        result={output.result}
      />
    );
  }

  return (
    <ActionDetail
      icon={CheckCircle2}
      title={formatToolName(output.tool)}
      result={output.result}
    />
  );
}

function EmailConfirmation({
  result,
}: {
  result: Record<string, unknown>;
}) {
  const actionId = toNumber(
    result.action_id,
  );

  const email = asRecord(
    result.email,
  );

  const [state, setState] = useState<
    'pending'
    | 'sending'
    | 'sent'
    | 'cancelled'
    | 'error'
  >(
    result.requires_confirmation
      ? 'pending'
      : 'error',
  );

  const [message, setMessage] =
    useState(
      toStringValue(result.message),
    );

  const handleConfirm = async () => {
    if (!actionId) {
      setState('error');
      setMessage(
        'The email confirmation ID is missing.',
      );
      return;
    }

    setState('sending');

    try {
      const confirmation =
        await confirmAction(actionId);

      setState('sent');
      setMessage(
        confirmation.result.message
        || 'Email sent successfully.',
      );
    } catch (error) {
      setState('error');
      setMessage(
        error instanceof Error
          ? error.message
          : 'Email sending failed.',
      );
    }
  };

  const handleCancel = async () => {
    if (!actionId) {
      setState('cancelled');
      return;
    }

    try {
      await cancelAction(actionId);
      setState('cancelled');
      setMessage(
        'Email sending was cancelled.',
      );
    } catch (error) {
      setState('error');
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not cancel the email.',
      );
    }
  };

  if (
    result.status === 'not_connected'
  ) {
    return (
      <DetailCard
        icon={Mail}
        title="Gmail connection required"
      >
        <p className="text-xs text-on-surface-variant">
          {message}
        </p>
      </DetailCard>
    );
  }

  return (
    <DetailCard
      icon={Mail}
      title="Email awaiting confirmation"
    >
      <div className="space-y-3">
        <div className="grid gap-2 text-xs">
          <DetailRow
            label="To"
            value={toStringValue(
              email.recipient,
            )}
          />

          <DetailRow
            label="Subject"
            value={toStringValue(
              email.subject,
            )}
          />
        </div>

        <div className="rounded-xl border border-surface-high bg-black/10 p-3">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-on-surface-variant">
            {toStringValue(email.body)}
          </p>
        </div>

        {state === 'pending' && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-surface transition-opacity hover:opacity-90"
            >
              <Send className="h-3.5 w-3.5" />
              Confirm and send
            </button>

            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center gap-2 rounded-xl border border-surface-high px-4 py-2 text-xs font-bold text-on-surface-variant hover:border-red-400/40 hover:text-red-300"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        )}

        {state === 'sending' && (
          <p className="flex items-center gap-2 text-xs text-primary">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            Sending email...
          </p>
        )}

        {state === 'sent' && (
          <p className="flex items-center gap-2 text-xs font-bold text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            {message}
          </p>
        )}

        {state === 'cancelled' && (
          <p className="text-xs text-on-surface-variant">
            {message}
          </p>
        )}

        {state === 'error' && (
          <p className="text-xs text-red-300">
            {message}
          </p>
        )}
      </div>
    </DetailCard>
  );
}

function CalendarDetails({
  result,
}: {
  result: Record<string, unknown>;
}) {
  const events = Array.isArray(
    result.events,
  )
    ? result.events.map(asRecord)
    : [];

  return (
    <DetailCard
      icon={CalendarDays}
      title={`Calendar · ${events.length} ${
        events.length === 1
          ? 'event'
          : 'events'
      }`}
    >
      {events.length === 0 ? (
        <p className="text-xs text-on-surface-variant">
          No events found for this period.
        </p>
      ) : (
        <div className="space-y-2">
          {events.map((event, index) => (
            <div
              key={
                toStringValue(event.id)
                || index
              }
              className="rounded-xl border border-surface-high bg-black/10 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-on-surface">
                    {toStringValue(
                      event.title,
                    )}
                  </p>

                  <p className="mt-1 text-[10px] text-on-surface-variant">
                    {formatDateTime(
                      toStringValue(
                        event.start_time,
                      ),
                    )}
                  </p>
                </div>

                {Boolean(event.event_url) && (
                  <a
                    href={toStringValue(
                      event.event_url,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:opacity-75"
                    aria-label="Open calendar event"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </DetailCard>
  );
}

function WeatherDetails({
  result,
}: {
  result: Record<string, unknown>;
}) {
  return (
    <DetailCard
      icon={CloudRain}
      title={`Weather · ${toStringValue(
        result.location,
      )}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-base font-bold text-on-surface">
            {toStringValue(
              result.condition,
            )}
          </p>

          <p className="mt-1 text-xs text-on-surface-variant">
            {toStringValue(result.date)}
          </p>
        </div>

        <p className="text-lg font-bold text-primary">
          {toStringValue(
            result.temperature_min_c,
          )}
          ° –{' '}
          {toStringValue(
            result.temperature_max_c,
          )}
          °C
        </p>
      </div>

      {Boolean(result.advice) && (
        <p className="mt-3 text-xs text-on-surface-variant">
          {toStringValue(result.advice)}
        </p>
      )}
    </DetailCard>
  );
}

function ActionDetail({
  icon,
  title,
  result,
}: {
  icon: typeof CheckCircle2;
  title: string;
  result: Record<string, unknown>;
}) {
  return (
    <DetailCard
      icon={icon}
      title={title}
    >
      <p className="text-xs leading-relaxed text-on-surface-variant">
        {toStringValue(
          result.message,
        ) || 'Action completed.'}
      </p>
    </DetailCard>
  );
}

function DetailCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof CheckCircle2;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-surface-high bg-surface-highest p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />

        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-primary">
          {title}
        </p>
      </div>

      {children}
    </article>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="w-14 flex-shrink-0 text-on-surface-variant">
        {label}
      </span>

      <span className="font-medium text-on-surface">
        {value || 'Not provided'}
      </span>
    </div>
  );
}

function findFinalMessage(
  response: OrchestrateResponse,
): string {
  return (
    [...response.trace]
      .reverse()
      .find(
        (step) =>
          step.agent === 'Orchestrator'
          && step.type === 'final',
      )
      ?.message
    || ''
  );
}

function isHeading(
  value: string,
): boolean {
  const trimmed = value.trim();

  return (
    trimmed.startsWith('**')
    && trimmed.endsWith('**')
    && trimmed.length
      < 80
  );
}

function stripMarkdown(
  value: string,
): string {
  return value
    .replace(/^\*\*/, '')
    .replace(/\*\*$/, '');
}

function asRecord(
  value: unknown,
): Record<string, unknown> {
  if (
    value
    && typeof value === 'object'
    && !Array.isArray(value)
  ) {
    return value as Record<
      string,
      unknown
    >;
  }

  return {};
}

function toStringValue(
  value: unknown,
): string {
  if (
    value === null
    || value === undefined
  ) {
    return '';
  }

  return String(value);
}

function toNumber(
  value: unknown,
): number | null {
  const numberValue = Number(value);

  return Number.isFinite(numberValue)
    ? numberValue
    : null;
}

function formatToolName(
  tool: string,
): string {
  return tool
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function formatDateTime(
  value: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(
    'en-IN',
    {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  );
}