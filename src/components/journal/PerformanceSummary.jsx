import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Percent, Scale, Hash } from 'lucide-react';

// The top-level "glance and know" summary: four headline tiles only — Net P/L,
// Win Rate, Profit Factor and Total Trades. Everything else (risk, streaks,
// averages, drawdown, pips and every engine/behaviour breakdown) lives in the
// Deep dive tab, and the account ledger lives in the Account tab. All figures
// here are scoped to the analysis window (account + date + engine version +
// instrument).

export const fmtSigned = (n, opts = {}) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: opts.dp ?? 2, minimumFractionDigits: opts.dp ?? 0 });
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${opts.prefix ?? ''}${s}`;
};
export const fmtMoney = (n, currency) => (n == null || !Number.isFinite(n) ? '—' : fmtSigned(n, { prefix: currency ? `${currency} ` : '' }));

/**
 * A single metric tile. A null/undefined value renders a muted em-dash — never a
 * verbose "add trade results to unlock this stat" placeholder. Whole-tier empty
 * states are handled once, by the page, not per card.
 * @param {{ icon: any, label: string, value?: any, sub?: any, tone?: 'up'|'down'|'neutral', index?: number }} props
 */
export function MetricCard({ icon: Icon, label, value, sub, tone = 'neutral', index = 0 }) {
  const empty = value == null;
  const toneClass = empty
    ? 'text-muted-foreground'
    : tone === 'up' ? 'text-emerald-500' : tone === 'down' ? 'text-red-500' : 'text-foreground';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.24) }}
      className="rounded-2xl border border-border bg-card p-3.5 shadow-sm"
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className={cn('mt-1.5 font-mono text-lg font-bold leading-none tabular-nums', toneClass)}>
        {empty ? '—' : value}
      </div>
      {!empty && sub && <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>}
    </motion.div>
  );
}

export default function PerformanceSummary({ stats, currency, monetaryEnabled = true }) {
  const { totalTrades, wins, losses, winRate, hasPnl, netPnl, profitFactor, incompleteCount } = stats;
  const showMoney = monetaryEnabled && hasPnl;

  const profitFactorValue = !monetaryEnabled || profitFactor == null
    ? null
    : !Number.isFinite(profitFactor) ? '∞' : profitFactor.toFixed(2);
  const profitFactorSub = Number.isFinite(profitFactor) ? undefined : 'No losing trades';

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <MetricCard index={0} icon={netPnl >= 0 ? TrendingUp : TrendingDown} label="Net P/L"
        value={showMoney ? fmtMoney(netPnl, currency) : null}
        tone={!showMoney ? 'neutral' : netPnl >= 0 ? 'up' : 'down'} />
      <MetricCard index={1} icon={Percent} label="Win Rate"
        value={totalTrades ? `${Math.round(winRate)}%` : null} sub={`${wins}W · ${losses}L`}
        tone={winRate >= 50 ? 'up' : winRate > 0 ? 'down' : 'neutral'} />
      <MetricCard index={2} icon={Scale} label="Profit Factor"
        value={profitFactorValue} sub={profitFactorSub}
        tone={profitFactorValue == null ? 'neutral' : profitFactor >= 1 ? 'up' : 'down'} />
      <MetricCard index={3} icon={Hash} label="Total Trades"
        value={totalTrades || null} sub={incompleteCount ? `${incompleteCount} need a result` : undefined} />
    </div>
  );
}
