import { Activity, Gauge, Zap } from 'lucide-react';

interface TokenMeterProps {
  tokenCount: number;
  loading: boolean;
  cached?: boolean;
}

const DISPLAY_LIMIT = 4000;

export default function TokenMeter({
  tokenCount,
  loading,
  cached = false,
}: TokenMeterProps) {
  const percentage = Math.min(
    (tokenCount / DISPLAY_LIMIT) * 100,
    100,
  );

  return (
    <section className="rounded-3xl border border-surface-high bg-surface-low p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
            Token Meter
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Approximate session usage
          </p>
        </div>

        <div
          className={[
            'flex items-center gap-2 rounded-full border px-3 py-1 text-[9px] font-bold uppercase tracking-wider',
            cached
              ? 'border-yellow-300/30 bg-yellow-300/10 text-yellow-300'
              : 'border-primary/30 bg-primary/10 text-primary',
          ].join(' ')}
        >
          {cached ? (
            <Zap className="h-3 w-3" />
          ) : (
            <Activity
              className={`h-3 w-3 ${
                loading ? 'animate-pulse' : ''
              }`}
            />
          )}

          {cached
            ? 'Cached'
            : loading
              ? 'Counting'
              : 'Estimated'}
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-3xl font-bold text-primary">
            {tokenCount.toLocaleString()}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-on-surface-variant">
            estimated tokens
          </p>
        </div>

        <Gauge className="h-8 w-8 text-primary/60" />
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-highest">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-tertiary transition-all duration-500"
          style={{
            width: `${Math.max(
              tokenCount > 0 ? 2 : 0,
              percentage,
            )}%`,
          }}
        />
      </div>

      <div className="mt-2 flex justify-between font-mono text-[9px] text-on-surface-variant">
        <span>0</span>
        <span>{DISPLAY_LIMIT.toLocaleString()} display scale</span>
      </div>

      <p className="mt-4 rounded-xl border border-surface-high bg-surface-highest px-3 py-2 text-[10px] leading-relaxed text-on-surface-variant">
        This is a lightweight UI estimate based on serialized
        request and event size. It is not a billing measurement.
      </p>
    </section>
  );
}