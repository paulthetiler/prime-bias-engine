import React from 'react';
import { cn } from '@/lib/utils';

// Tri-state button: null → +1 → -1 → null
function TriButton({ label, value, onChange }) {
  const cycle = () => {
    if (value === null) onChange(1);
    else if (value === 1) onChange(-1);
    else onChange(null);
  };

  const display = value === 1 ? '+1' : value === -1 ? '-1' : '—';
  const color = value === 1 ? 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10'
              : value === -1 ? 'text-red-400 border-red-500/50 bg-red-500/10'
              : 'text-muted-foreground border-border bg-secondary';

  return (
    <button
      onClick={cycle}
      className={cn('flex-1 rounded-lg border px-3 py-2 text-center transition-colors', color)}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      <div className="text-base font-bold font-mono">{display}</div>
    </button>
  );
}

export default function ExtraCheck({ h1, m15, onChange }) {
  // Determine result
  let result = null;
  if (h1 !== null && m15 !== null) {
    result = h1 === m15 ? 'green' : 'red';
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-foreground">Extra Check</div>
        <div className="text-[10px] text-muted-foreground">red light / green light</div>
      </div>

      <div className="flex gap-2">
        <TriButton label="1H" value={h1} onChange={(v) => onChange('h1', v)} />
        <TriButton label="15M" value={m15} onChange={(v) => onChange('m15', v)} />
      </div>

      {result === 'green' && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Green Light</span>
        </div>
      )}
      {result === 'red' && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
          <span className="text-xs font-semibold text-red-700 dark:text-red-300">Red Light</span>
        </div>
      )}
    </div>
  );
}