import React from 'react';
import { cn } from '@/lib/utils';

function Pill({ label, value, valueClass }) {
  return (
    <div className="flex flex-col items-center">
      <span className={cn('text-sm font-bold', valueClass || 'text-foreground')}>{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

export default function YearSummaryBar({ entries }) {
  if (!entries.length) return null;

  const totalPnl = entries.reduce((s, e) => s + (e.pnl || 0), 0);
  const startBal = entries.reduce((min, e) => (e.start_balance != null && e.start_balance < min ? e.start_balance : min), Infinity);
  const endBal = entries.reduce((max, e) => (e.end_balance != null && e.end_balance > max ? e.end_balance : max), -Infinity);
  const totalPips = entries.reduce((s, e) => s + (e.total_pips || 0), 0);
  const totalTrades = entries.reduce((s, e) => s + (e.total_positions || 0), 0);
  const wins = entries.filter(e => e.pnl > 0).length;
  const growth = startBal && startBal !== Infinity && endBal !== -Infinity
    ? (((endBal - startBal) / startBal) * 100).toFixed(1)
    : null;

  const pnlColor = totalPnl > 0 ? 'text-emerald-600 dark:text-emerald-400' : totalPnl < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground';

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Year Summary</div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <Pill label="P&L" value={`${totalPnl >= 0 ? '+' : ''}£${totalPnl.toFixed(0)}`} valueClass={pnlColor} />
        <Pill label="Growth" value={growth != null ? `${growth}%` : '—'} valueClass={pnlColor} />
        <Pill label="Pips" value={totalPips.toFixed(0)} />
        <Pill label="Trades" value={totalTrades || '—'} />
      </div>
    </div>
  );
}