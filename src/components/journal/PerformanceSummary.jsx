import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, Percent, Sigma, Scale, Hash, Flame, Trophy,
  ArrowUpRight, ArrowDownRight, Target, Activity, Wallet, Ruler,
} from 'lucide-react';
import { TIME_FILTERS } from '@/lib/journalStats';
import EquityCurve from './EquityCurve';

// ── formatting helpers ────────────────────────────────────────────────────────
const LOCKED = 'Add trade results to unlock this stat.';

const fmtSigned = (n, opts = {}) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: opts.dp ?? 2, minimumFractionDigits: opts.dp ?? 0 });
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${opts.prefix ?? ''}${s}`;
};
const fmtMoney = (n, currency) => (n == null || !Number.isFinite(n) ? '—' : fmtSigned(n, { prefix: currency ? `${currency} ` : '' }));

/**
 * A single metric tile. Colour is opt-in via `tone` so green/red stays reserved
 * for the numbers where direction actually carries meaning. When `value` is null
 * the tile shows a muted empty-state hint instead of a fake number.
 */
/** @param {{ icon: any, label: string, value?: any, sub?: any, hint?: any, tone?: 'up'|'down'|'neutral', index?: number }} props */
function MetricCard({ icon: Icon, label, value, sub, hint, tone = 'neutral', index = 0 }) {
  const toneClass = tone === 'up' ? 'text-emerald-500' : tone === 'down' ? 'text-red-500' : 'text-foreground';
  const empty = value == null;
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
      {empty ? (
        <div className="mt-1.5 text-[11px] leading-tight text-muted-foreground">{hint || LOCKED}</div>
      ) : (
        <>
          <div className={cn('mt-1.5 font-mono text-lg font-bold leading-none tabular-nums', toneClass)}>{value}</div>
          {sub && <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>}
        </>
      )}
    </motion.div>
  );
}

/**
 * The dashboard header: time-window chips, a metric grid and the equity curve.
 * Money figures come from realised net P/L; ROI + balance are account-relative
 * and passed in from the page (which owns deposits/withdrawals).
 */
export default function PerformanceSummary({
  stats, perf, series, timeframe, onTimeframe,
  roiPct, openingBalance, currentBalance, currency, monetaryEnabled = true,
}) {
  const {
    totalTrades, wins, losses, winRate, hasPnl, netPnl, profitFactor,
    avgR, hasRiskData, bestWinStreak, currentStreak, streakType, incompleteCount,
  } = stats;

  const streakValue = currentStreak > 0 ? `${currentStreak}${streakType === 'win' ? 'W' : 'L'}` : null;
  const showMoney = monetaryEnabled && hasPnl;

  // Profit factor rendering: null → empty; Infinity → "No losing trades".
  const profitFactorValue = !monetaryEnabled || profitFactor == null
    ? null
    : !Number.isFinite(profitFactor) ? '∞' : profitFactor.toFixed(2);
  const profitFactorSub = Number.isFinite(profitFactor) ? undefined : 'No losing trades';

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
          value={showMoney ? fmtMoney(netPnl, currency) : null}
          tone={!showMoney ? 'neutral' : netPnl >= 0 ? 'up' : 'down'}
        />
        <MetricCard
          index={1}
          icon={Percent}
          label="Win Rate"
          value={totalTrades ? `${Math.round(winRate)}%` : null}
          sub={`${wins}W · ${losses}L`}
          tone={winRate >= 50 ? 'up' : winRate > 0 ? 'down' : 'neutral'}
        />
        <MetricCard
          index={2}
          icon={TrendingUp}
          label="ROI"
          value={monetaryEnabled && roiPct != null ? `${fmtSigned(roiPct, { dp: 1 })}%` : null}
          sub={monetaryEnabled && roiPct != null && openingBalance != null ? `on ${fmtMoney(openingBalance, currency).replace('+', '')}` : undefined}
          tone={roiPct == null ? 'neutral' : roiPct >= 0 ? 'up' : 'down'}
        />
        <MetricCard
          index={3}
          icon={Scale}
          label="Profit Factor"
          value={profitFactorValue}
          sub={profitFactorSub}
          tone={profitFactorValue == null ? 'neutral' : profitFactor >= 1 ? 'up' : 'down'}
        />
        <MetricCard
          index={4}
          icon={Sigma}
          label="Avg R"
          value={hasRiskData ? `${avgR.toFixed(2)}R` : null}
          hint="Not enough risk data"
          tone={!hasRiskData ? 'neutral' : avgR >= 0 ? 'up' : 'down'}
        />
        <MetricCard
          index={5}
          icon={Hash}
          label="Total Trades"
          value={totalTrades || null}
          sub={incompleteCount ? `${incompleteCount} need a result` : undefined}
        />
        <MetricCard
          index={6}
          icon={Flame}
          label="Streak"
          value={streakValue}
          sub={streakValue ? 'current' : undefined}
          tone={currentStreak > 0 ? (streakType === 'win' ? 'up' : 'down') : 'neutral'}
        />
        <MetricCard
          index={7}
          icon={Trophy}
          label="Best Streak"
          value={bestWinStreak || null}
          sub={bestWinStreak ? 'wins in a row' : undefined}
          tone={bestWinStreak ? 'up' : 'neutral'}
        />
      </div>

      {/* Extended metrics (phase 6) — proves the new performance layer is wired. */}
      {perf && monetaryEnabled && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <MetricCard
            index={0} icon={ArrowUpRight} label="Avg Win"
            value={perf.averageWin != null ? fmtMoney(perf.averageWin, currency) : null}
            hint="No wins yet" tone={perf.averageWin != null ? 'up' : 'neutral'}
          />
          <MetricCard
            index={1} icon={ArrowDownRight} label="Avg Loss"
            value={perf.averageLoss != null ? fmtMoney(-perf.averageLoss, currency) : null}
            hint="No losses yet" tone={perf.averageLoss != null ? 'down' : 'neutral'}
          />
          <MetricCard
            index={2} icon={Target} label="Expectancy"
            value={perf.expectancyMoney != null ? fmtMoney(perf.expectancyMoney, currency) : null}
            sub="per trade"
            tone={perf.expectancyMoney == null ? 'neutral' : perf.expectancyMoney >= 0 ? 'up' : 'down'}
          />
          <MetricCard
            index={3} icon={Activity} label="Max Drawdown"
            value={perf.tradingDrawdown != null ? `${fmtMoney(-perf.tradingDrawdown, currency)}` : null}
            sub={perf.tradingDrawdownPct ? `${perf.tradingDrawdownPct}% · trading` : 'trading only'}
            tone={perf.tradingDrawdown ? 'down' : 'neutral'}
          />
          <MetricCard
            index={4} icon={Wallet} label="Wages Withdrawn"
            value={perf.wages ? fmtMoney(-perf.wages, currency) : (perf.hasPnl ? fmtMoney(0, currency) : null)}
            hint="No wages" tone="neutral"
          />
          <MetricCard
            index={5} icon={Ruler} label="Total Pips"
            value={perf.totalPips != null ? fmtSigned(perf.totalPips, { dp: 1 }) : null}
            sub={perf.pipsCount ? `${perf.pipsCount} trades · avg ${perf.avgPips}` : undefined}
            hint="No pips recorded"
            tone={perf.totalPips == null ? 'neutral' : perf.totalPips >= 0 ? 'up' : 'down'}
          />
          <MetricCard
            index={6} icon={Hash} label="Worst Loss Streak"
            value={perf.worstLossStreak || null}
            sub={perf.worstLossStreak ? 'losses in a row' : undefined}
            tone={perf.worstLossStreak ? 'down' : 'neutral'}
          />
        </div>
      )}

      {/* Equity curve */}
      <EquityCurve
        series={series}
        hasPnl={showMoney}
        currentBalance={currentBalance}
        currency={currency}
      />
    </div>
  );
}
