import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, XCircle, MinusCircle } from 'lucide-react';

export default function BiasResult({ results }) {
  if (!results) return null;

  const { mainDirection, grade, gradeLabel, confidenceScore, tradeAction, status, strength, deepTrend, deepStrength, ddBias, ddStrength, nowBias, nowStrength, plusMinusScore, warnings, targetNote } = results;

  const dirColor = mainDirection === 'BUY' ? 'text-emerald-400' : mainDirection === 'SELL' ? 'text-red-400' : 'text-muted-foreground';
  const dirBg = mainDirection === 'BUY' ? 'bg-emerald-500/10 border-emerald-500/30' : mainDirection === 'SELL' ? 'bg-red-500/10 border-red-500/30' : 'bg-secondary border-border';

  const gradeColors = {
    A: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
    B: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
    C: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30',
    D: 'text-orange-400 bg-orange-500/15 border-orange-500/30',
    F: 'text-red-400 bg-red-500/15 border-red-500/30',
  };

  const actionColors = {
    TRADE: 'bg-emerald-500 text-white',
    WAIT: 'bg-yellow-500 text-black',
    NO_TRADE: 'bg-red-500 text-white',
  };

  const actionLabels = { TRADE: 'TRADE', WAIT: 'WAIT', NO_TRADE: 'NO TRADE' };

  // Now momentum color — based on nowBias direction, NOT mainDirection
  const nowColor = nowBias === 'BUY' ? 'text-emerald-400' : nowBias === 'SELL' ? 'text-red-400' : 'text-muted-foreground';
  const nowScoreColor = plusMinusScore > 0 ? 'text-emerald-400' : plusMinusScore < 0 ? 'text-red-400' : 'text-muted-foreground';

  // Strength colour inherits direction: buy-side = green shades, sell-side = red/pink shades, neutral = grey
  // STRONG = full colour, MEDIUM = mid, WEAK = pale/muted
  function strengthColor(direction, strength) {
    const isBuy  = direction === 'BUY'  || direction === 'BULL';
    const isSell = direction === 'SELL' || direction === 'BEAR';
    if (!isBuy && !isSell) return 'text-muted-foreground';
    if (isBuy) {
      if (strength === 'STRONG') return 'text-emerald-400';
      if (strength === 'MEDIUM') return 'text-emerald-500';
      if (strength === 'WEAK')   return 'text-emerald-700';
      return 'text-muted-foreground';
    }
    // sell-side
    if (strength === 'STRONG') return 'text-red-400';
    if (strength === 'MEDIUM') return 'text-orange-400';
    if (strength === 'WEAK')   return 'text-rose-600';
    return 'text-muted-foreground';
  }

  return (
    <div className="space-y-3">

      {/* ── FINAL TREND ── Deep + DD driven direction */}
      <div className="rounded-xl border border-border bg-secondary/40 p-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Trend</div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mainDirection === 'BUY' ? <TrendingUp className="w-5 h-5 text-emerald-400" /> : mainDirection === 'SELL' ? <TrendingDown className="w-5 h-5 text-red-400" /> : <MinusCircle className="w-5 h-5" />}
            <span className={cn('text-2xl font-bold', dirColor)}>{mainDirection}</span>
          </div>
          <div className="text-right">
            <div className={cn('text-sm font-semibold', strengthColor(mainDirection, ddStrength))}>{ddStrength}</div>
            <div className="text-[10px] text-muted-foreground">signal</div>
          </div>
        </div>
      </div>

      {/* ── NOW MOMENTUM ── separate from final trend */}
      <div className="rounded-xl border border-border bg-secondary/40 p-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Now Momentum</div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {nowBias === 'BUY' ? <TrendingUp className="w-5 h-5 text-emerald-400" /> : nowBias === 'SELL' ? <TrendingDown className="w-5 h-5 text-red-400" /> : <MinusCircle className="w-5 h-5 text-muted-foreground" />}
            <span className={cn('text-2xl font-bold', nowColor)}>{nowBias || '—'}</span>
          </div>
          <div className="text-right">
            <div className={cn('text-sm font-semibold', strengthColor(nowBias, nowStrength))}>{nowStrength}</div>
            <div className="text-[10px] text-muted-foreground">
              {plusMinusScore > 0 ? `+${plusMinusScore}` : plusMinusScore} score
            </div>
          </div>
        </div>
      </div>

      {/* ── ACTION + GRADE ── */}
      <div className="grid grid-cols-2 gap-2">
        <div className={cn('rounded-lg p-3 text-center flex flex-col items-center justify-center', actionColors[tradeAction])}>
          <div className="text-base font-bold leading-tight">{actionLabels[tradeAction]}</div>
          <div className="text-[10px] uppercase tracking-wider opacity-80">{status}</div>
        </div>
        <div className={cn('rounded-lg border p-3 text-center', gradeColors[grade])}>
          <div className="text-2xl font-bold">{grade} <span className="text-sm font-semibold opacity-80">{gradeLabel}</span></div>
          <div className="text-[10px] uppercase tracking-wider opacity-60">Grade</div>
        </div>
      </div>

      {/* ── TARGET ── */}
      <div className="rounded-lg border border-border bg-secondary p-3 text-center">
        <div className="text-sm font-bold font-mono">{targetNote || '—'}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Target</div>
      </div>

      {/* ── BLOCK BREAKDOWN ── */}
      <div className="grid grid-cols-3 gap-2">
        <TrendPill label="Deep" value={deepTrend} sub={deepStrength} />
        <TrendPill label="DD" value={ddBias} sub={ddStrength} />
        <TrendPill label="Now" value={nowBias} sub={nowStrength} />
      </div>

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
    if (strength === 'STRONG') return 'text-emerald-400';
    if (strength === 'MEDIUM') return 'text-emerald-500';
    if (strength === 'WEAK')   return 'text-emerald-700';
    return 'text-muted-foreground';
  }
  if (strength === 'STRONG') return 'text-red-400';
  if (strength === 'MEDIUM') return 'text-orange-400';
  if (strength === 'WEAK')   return 'text-rose-600';
  return 'text-muted-foreground';
}

function TrendPill({ label, value, sub }) {
  const color = value === 'BUY' || value === 'BULL' ? 'text-emerald-400' : value === 'SELL' || value === 'BEAR' ? 'text-red-400' : 'text-muted-foreground';
  return (
    <div className="rounded-lg bg-secondary/80 border border-border p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('text-sm font-bold', color)}>{value || '—'}</div>
      {sub && <div className={cn('text-[9px] mt-0.5', strengthColor(value, sub))}>{sub}</div>}
    </div>
  );
}