import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, Percent, Target, Scale, Hash, Flame, Trophy,
} from 'lucide-react';
import { TIME_FILTERS } from '@/lib/journalStats';
import EquityCurve from './EquityCurve';

// ── formatting helpers ────────────────────────────────────────────────────────
const fmtSigned = (n, opts = {}) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = n.toLocaleString(undefined, { maximumFractionDigits: opts.dp ?? 2, minimumFractionDigits: opts.dp ?? 0 });
  return `${n > 0 ? '+' : ''}${s}`;
};
const fmtPf = (pf) => {
  if (pf == null) return '—';
  if (!Number.isFinite(pf)) return '∞';
  return pf.toFixed(2);
};

/**
 * A single metric tile. Colour is opt-in via `tone` so green/red stays reserved
 * for the numbers where direction actually carries meaning.
 * @param {{ icon: any, label: string, value: React.ReactNode, sub?: string, tone?: 'up'|'down'|'neutral', index?: number }} props
 */
function MetricCard({ icon: Icon, label, value, sub, tone = 'neutral', index = 0 }) {
  const toneClass =
    tone === 'up' ? 'text-emerald-500' : tone === 'down' ? 'text-red-500' : 'text-foreground';
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
      <div className={cn('mt-1.5 font-mono text-lg font-bold leading-none tabular-nums', toneClass)}>{value}</div>
      {sub && <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>}
    </motion.div>
  );
}

/**
 * The dashboard header: time-window chips, a metric grid and the equity curve.
 * @param {{
 *   stats: any,
 *   series: any[],
 *   timeframe: string,
 *   onTimeframe: (id: string) => void,
 *   startingBalance: number,
 *   balanceSource?: 'journal'|'default',
 * }} props
 */
export default function PerformanceSummary({ stats, series, timeframe, onTimeframe, startingBalance, balanceSource }) {
  const {
    totalTrades, wins, losses, winRate, hasPnl, netPnl, profitFactor, roiPct,
    avgRr, bestWinStreak, currentStreak, streakType,
  } = stats;

  const streakValue = currentStreak > 0 ? `${currentStreak}${streakType === 'win' ? 'W' : 'L'}` : '—';

  return (
    <div className="space-y-3">
      {/* Time filters */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TIME_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => onTimeframe(f.id)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95',
              timeframe === f.id
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border bg-card text-muted-foreground hover:border-primary/40'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <MetricCard
          index={0}
          icon={netPnl >= 0 ? TrendingUp : TrendingDown}
          label="Net P/L"
          value={hasPnl ? fmtSigned(netPnl) : '—'}
          tone={!hasPnl ? 'neutral' : netPnl >= 0 ? 'up' : 'down'}
        />
        <MetricCard
          index={1}
          icon={Percent}
          label="Win Rate"
          value={`${Math.round(winRate)}%`}
          sub={`${wins}W · ${losses}L`}
          tone={winRate >= 50 ? 'up' : winRate > 0 ? 'down' : 'neutral'}
        />
        <MetricCard
          index={2}
          icon={TrendingUp}
          label="ROI"
          value={roiPct == null ? '—' : `${fmtSigned(roiPct, { dp: 1 })}%`}
          tone={roiPct == null ? 'neutral' : roiPct >= 0 ? 'up' : 'down'}
        />
        <MetricCard
          index={3}
          icon={Scale}
          label="Profit Factor"
          value={fmtPf(profitFactor)}
          tone={profitFactor == null ? 'neutral' : profitFactor >= 1 ? 'up' : 'down'}
        />
        <MetricCard
          index={4}
          icon={Target}
          label="Avg R:R"
          value={avgRr == null ? '—' : `${avgRr.toFixed(1)}`}
          sub={avgRr == null ? undefined : 'planned'}
        />
        <MetricCard
          index={5}
          icon={Hash}
          label="Total Trades"
          value={totalTrades}
        />
        <MetricCard
          index={6}
          icon={Flame}
          label="Streak"
          value={streakValue}
          sub="current"
          tone={currentStreak > 0 ? (streakType === 'win' ? 'up' : 'down') : 'neutral'}
        />
        <MetricCard
          index={7}
          icon={Trophy}
          label="Best Streak"
          value={bestWinStreak || '—'}
          sub={bestWinStreak ? 'wins in a row' : undefined}
          tone={bestWinStreak ? 'up' : 'neutral'}
        />
      </div>

      {/* Equity curve */}
      <EquityCurve series={series} hasPnl={hasPnl} startingBalance={startingBalance} balanceSource={balanceSource} />
    </div>
  );
}
