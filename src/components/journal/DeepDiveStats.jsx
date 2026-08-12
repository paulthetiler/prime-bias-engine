import React from 'react';
import {
  Sigma, Flame, Trophy, ArrowUpRight, ArrowDownRight, Target, Activity, Ruler, Hash,
} from 'lucide-react';
import { MetricCard, fmtMoney, fmtSigned } from './PerformanceSummary';

// The secondary trade-quality tiles that used to crowd the summary: risk,
// streaks, per-trade averages, drawdown and pips. They share the analysis scope
// (account + date + engine version + instrument) with the summary. Only tiles
// that actually have data are rendered — no per-card "unlock this stat" filler.

/**
 * @param {{
 *   stats: any,
 *   perf: any | null,   // trade summary (money) — null under mixed currencies
 *   currency?: string|null,
 *   monetaryEnabled?: boolean,
 * }} props
 */
export default function DeepDiveStats({ stats, perf, currency, monetaryEnabled = true }) {
  const { avgR, hasRiskData, bestWinStreak, currentStreak, streakType } = stats;
  const streakValue = currentStreak > 0 ? `${currentStreak}${streakType === 'win' ? 'W' : 'L'}` : null;
  const money = perf && monetaryEnabled;

  // Each entry is only rendered when its value is present, so the grid never
  // shows an empty placeholder tile.
  const cards = [
    hasRiskData && {
      icon: Sigma, label: 'Avg R', value: `${avgR.toFixed(2)}R`, tone: avgR >= 0 ? 'up' : 'down',
    },
    streakValue && {
      icon: Flame, label: 'Streak', value: streakValue, sub: 'current',
      tone: streakType === 'win' ? 'up' : 'down',
    },
    bestWinStreak > 0 && {
      icon: Trophy, label: 'Best Streak', value: bestWinStreak, sub: 'wins in a row', tone: 'up',
    },
    money && perf.averageWin != null && {
      icon: ArrowUpRight, label: 'Avg Win', value: fmtMoney(perf.averageWin, currency), tone: 'up',
    },
    money && perf.averageLoss != null && {
      icon: ArrowDownRight, label: 'Avg Loss', value: fmtMoney(-perf.averageLoss, currency), tone: 'down',
    },
    money && perf.expectancyMoney != null && {
      icon: Target, label: 'Expectancy', value: fmtMoney(perf.expectancyMoney, currency), sub: 'per trade',
      tone: perf.expectancyMoney >= 0 ? 'up' : 'down',
    },
    money && perf.tradingDrawdown != null && {
      icon: Activity, label: 'Max Drawdown', value: fmtMoney(-perf.tradingDrawdown, currency),
      sub: perf.tradingDrawdownPct ? `${perf.tradingDrawdownPct}% · trading` : 'trading only',
      tone: perf.tradingDrawdown ? 'down' : 'neutral',
    },
    money && perf.totalPips != null && {
      icon: Ruler, label: 'Total Pips', value: fmtSigned(perf.totalPips, { dp: 1 }),
      sub: perf.pipsCount ? `${perf.pipsCount} trades · avg ${perf.avgPips}` : undefined,
      tone: perf.totalPips >= 0 ? 'up' : 'down',
    },
    money && perf.worstLossStreak > 0 && {
      icon: Hash, label: 'Worst Loss Streak', value: perf.worstLossStreak, sub: 'losses in a row', tone: 'down',
    },
  ].filter(Boolean);

  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {cards.map((c, i) => (
        <MetricCard key={c.label} index={i} icon={c.icon} label={c.label} value={c.value} sub={c.sub} tone={c.tone} />
      ))}
    </div>
  );
}
