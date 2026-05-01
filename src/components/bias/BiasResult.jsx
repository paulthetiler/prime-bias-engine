import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, XCircle, MinusCircle } from 'lucide-react';

export default function BiasResult({ results, rawTimeframes, settings }) {
  if (!results) return null;

  const { mainDirection, grade, gradeLabel, confidenceScore, tradeAction, status, strength, deepTrend, deepStrength, ddBias, ddStrength, nowBias, nowStrength, plusMinusScore, winningScore, warnings, targetNote, timeframes } = results;
  
  // Debug panel — shows raw TF results and engine NOW output
  const tf = timeframes || rawTimeframes || {};
  const h1r  = tf.h1?.result  ?? '?';
  const m15r = tf.m15?.result ?? '?';
  const m5r  = tf.m5?.result  ?? '?';

  const dirColor = mainDirection === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : mainDirection === 'SELL' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground';
  const dirBg = mainDirection === 'BUY' ? 'bg-emerald-500/10 border-emerald-500/30' : mainDirection === 'SELL' ? 'bg-red-500/10 border-red-500/30' : 'bg-secondary border-border';

  const gradeColors = {
    A: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
    B: 'text-blue-600 dark:text-blue-400 bg-blue-500/15 border-blue-500/30',
    C: 'text-yellow-700 dark:text-yellow-400 bg-yellow-500/15 border-yellow-500/30',
    D: 'text-orange-600 dark:text-orange-400 bg-orange-500/15 border-orange-500/30',
    F: 'text-red-600 dark:text-red-400 bg-red-500/15 border-red-500/30',
  };

  const actionColors = {
    TRADE: 'bg-emerald-500 text-white',
    WAIT: 'bg-yellow-500 text-black',
    NO_TRADE: 'bg-red-500 text-white',
  };

  const actionLabels = { TRADE: 'TRADE', WAIT: 'WAIT', NO_TRADE: 'NO TRADE' };

  // Now momentum color — based on nowBias direction, NOT mainDirection
  const nowColor = nowBias === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : nowBias === 'SELL' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground';
  const nowScoreColor = plusMinusScore > 0 ? 'text-emerald-400' : plusMinusScore < 0 ? 'text-red-400' : 'text-muted-foreground';

  // Strength colour inherits direction: buy-side = green shades, sell-side = red/pink shades, neutral = grey
  // STRONG = full colour, MEDIUM = mid, WEAK = pale/muted
  function strengthColor(direction, strength) {
    const isBuy  = direction === 'BUY'  || direction === 'BULL';
    const isSell = direction === 'SELL' || direction === 'BEAR';
    if (!isBuy && !isSell) return 'text-muted-foreground';
    if (isBuy) {
      if (strength === 'STRONG') return 'text-emerald-600 dark:text-emerald-400';
      if (strength === 'MEDIUM') return 'text-emerald-600 dark:text-emerald-500';
      if (strength === 'WEAK')   return 'text-emerald-700 dark:text-emerald-700';
      return 'text-muted-foreground';
    }
    if (strength === 'STRONG') return 'text-red-600 dark:text-red-400';
    if (strength === 'MEDIUM') return 'text-orange-600 dark:text-orange-400';
    if (strength === 'WEAK')   return 'text-rose-700 dark:text-rose-600';
    return 'text-muted-foreground';
  }

  const statusBadge = status === 'Ready' || status === 'Scalp'
    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
    : status === 'Wait' || status === 'Weak'
    ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30'
    : 'bg-secondary text-muted-foreground border-border';

  return (
    <div className="space-y-3">

      {/* ── MAIN RESULT CARD ── Split layout */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex min-h-[120px]">

          {/* Left — Grade */}
          <div className="flex flex-col items-center justify-center px-5 py-4 bg-secondary/60 border-r border-border min-w-[90px]">
            <span className="text-5xl font-black tracking-tight text-foreground leading-none">{grade}</span>
            <span className="text-xs font-medium text-muted-foreground mt-1.5 text-center leading-tight">{gradeLabel}</span>
          </div>

          {/* Right — Decision info */}
          <div className="flex flex-col justify-center px-4 py-3 gap-1.5 flex-1">
            {/* Status badge */}
            <span className={cn('self-start text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', statusBadge)}>
              {status}
            </span>

            {/* Direction */}
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground w-14 shrink-0">Direction</span>
              <span className={cn('text-base font-bold', dirColor)}>{mainDirection}</span>
            </div>

            {/* Action */}
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground w-14 shrink-0">Action</span>
              <span className={cn('text-sm font-bold px-2 py-0.5 rounded-md', actionColors[tradeAction])}>
                {tradeAction === 'NO_TRADE' ? 'NO TRADE' : tradeAction}
              </span>
            </div>

            {/* Target */}
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground w-14 shrink-0">Target</span>
              <span className="text-sm font-mono font-semibold text-foreground">{targetNote || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── BLOCK BREAKDOWN ── */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Block Breakdown</div>
        <div className="grid grid-cols-3 gap-2">
          <TrendPill label="Deep" value={deepTrend} sub={deepStrength} />
          <TrendPill label="DD" value={ddBias} sub={ddStrength} />
          <TrendPill label="Now" value={nowBias} sub={nowStrength} />
        </div>
      </div>

      {/* ── BACKEND SCORE (optional) ── */}
      {settings?.showBackendScore && (
        <div className="rounded-lg border border-border bg-secondary/60 p-3 space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Backend Score</div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Score</span>
            <span className="font-mono font-bold text-foreground">{winningScore ?? 0} pts</span>
          </div>
        </div>
      )}

      {/* ── WARNINGS ── */}
      {warnings.length > 0 && (
        <div className="space-y-1.5">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-yellow-100 dark:bg-yellow-500/10 border border-yellow-300 dark:border-yellow-500/20 p-2.5 text-xs text-yellow-800 dark:text-yellow-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function strengthColor(direction, strength) {
  const isBuy  = direction === 'BUY'  || direction === 'BULL';
  const isSell = direction === 'SELL' || direction === 'BEAR';
  if (!isBuy && !isSell) return 'text-muted-foreground';
  if (isBuy) {
    if (strength === 'STRONG') return 'text-emerald-600 dark:text-emerald-400';
    if (strength === 'MEDIUM') return 'text-emerald-600 dark:text-emerald-500';
    if (strength === 'WEAK')   return 'text-emerald-700 dark:text-emerald-700';
    return 'text-muted-foreground';
  }
  if (strength === 'STRONG') return 'text-red-600 dark:text-red-400';
  if (strength === 'MEDIUM') return 'text-orange-600 dark:text-orange-400';
  if (strength === 'WEAK')   return 'text-rose-700 dark:text-rose-600';
  return 'text-muted-foreground';
}

function TrendPill({ label, value, sub }) {
  const color = value === 'BUY' || value === 'BULL' ? 'text-emerald-600 dark:text-emerald-400' : value === 'SELL' || value === 'BEAR' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground';
  return (
    <div className="rounded-lg bg-secondary/80 border border-border p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('text-sm font-bold', color)}>{value || '—'}</div>
      {sub && <div className={cn('text-[9px] mt-0.5', strengthColor(value, sub))}>{sub}</div>}
    </div>
  );
}