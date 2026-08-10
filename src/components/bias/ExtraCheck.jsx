import React from 'react';
import { cn } from '@/lib/utils';

// Four-state button: null → +1 → 0 → -1 → null
function TriButton({ label, value, onChange }) {
  const cycle = () => {
    if (value === null) onChange(1);
    else if (value === 1) onChange(0);
    else if (value === 0) onChange(-1);
    else onChange(null);
  };

  const display = value === 1 ? '+1' : value === -1 ? '-1' : value === 0 ? '0' : '—';
  const color = value === 1 ? 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10'
              : value === -1 ? 'text-red-400 border-red-500/50 bg-red-500/10'
              : value === 0 ? 'text-foreground border-border bg-background'
              : 'text-muted-foreground border-border bg-secondary';

  return (
    <button
      onClick={cycle}
      className={cn('min-w-0 rounded-lg border px-2 py-2 text-center transition-colors', color)}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      <div className="text-base font-bold font-mono">{display}</div>
    </button>
  );
}

export default function ExtraCheck({ h1, m15, onChange }) {
  // Light reflects the AGREED direction:
  //   both BUY  → green light  ·  both SELL → red light  ·  both 0 → neutral checked
  //   differing populated values → conflict  ·  any null → not checked
  let result = 'none'; // 'buy' | 'sell' | 'neutral' | 'conflict' | 'none'
  if (h1 !== null && m15 !== null) {
    if (h1 === 1 && m15 === 1) result = 'buy';
    else if (h1 === -1 && m15 === -1) result = 'sell';
    else if (h1 === 0 && m15 === 0) result = 'neutral';
    else result = 'conflict';
  }

  const light = {
    buy:      { box: 'bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400', text: 'text-emerald-700 dark:text-emerald-300', label: 'Buy confirmed' },
    sell:     { box: 'bg-red-500/10 border-red-500/30',         dot: 'bg-red-400',     text: 'text-red-700 dark:text-red-300',         label: 'Sell confirmed' },
    neutral:  { box: 'bg-secondary border-border',              dot: 'bg-muted-foreground', text: 'text-foreground',                    label: 'Checked — neutral' },
    conflict: { box: 'bg-yellow-500/10 border-yellow-500/30',   dot: 'bg-yellow-400',  text: 'text-yellow-700 dark:text-yellow-300',   label: '1H / 15M disagree' },
    none:     { box: 'bg-secondary border-border',              dot: 'bg-muted-foreground', text: 'text-muted-foreground',            label: 'Not checked' },
  }[result];

  const reset = () => {
    onChange('h1', null);
    onChange('m15', null);
  };

  const canReset = h1 !== null || m15 !== null;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-foreground">Extra Check</div>
          <div className="text-[10px] text-muted-foreground">red light / green light</div>
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={!canReset}
          className="rounded-md border border-border bg-secondary px-2.5 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-40"
          aria-label="Reset Extra Check to not checked"
        >
          Reset
        </button>
      </div>

      <div className="grid grid-cols-[64px_64px_minmax(0,1fr)] gap-2">
        <TriButton label="1H" value={h1} onChange={(v) => onChange('h1', v)} />
        <TriButton label="15M" value={m15} onChange={(v) => onChange('m15', v)} />

        <div className={cn('flex min-w-0 items-center justify-center gap-2 rounded-lg border px-2 py-2', light.box)}>
          <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', light.dot)} />
          <span className={cn('min-w-0 text-center text-[11px] font-semibold leading-tight', light.text)}>{light.label}</span>
        </div>
      </div>
    </div>
  );
}
