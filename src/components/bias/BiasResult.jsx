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

  const dirColor = mainDirection === 'BUY' ? 'text-primary' : mainDirection === 'SELL' ? 'text-destructive' : 'text-muted-foreground';
  const dirBg = mainDirection === 'BUY' ? 'bg-primary/10 border-primary/30' : mainDirection === 'SELL' ? 'bg-destructive/10 border-destructive/30' : 'bg-secondary border-border';

  const gradeColors = {
    A: 'text-primary bg-primary/15 border-primary/30',
    B: 'text-foreground bg-secondary border-border',
    C: 'text-yellow-700 dark:text-yellow-400 bg-yellow-500/15 border-yellow-500/30',
    D: 'text-orange-600 dark:text-orange-400 bg-orange-500/15 border-orange-500/30',
    F: 'text-destructive bg-destructive/15 border-destructive/30',
  };

  const actionColors = {
    TRADE: 'bg-primary text-white',
    WAIT: 'bg-yellow-500 text-black',
    NO_TRADE: 'bg-destructive text-white',
  };

  const actionLabels = { TRADE: 'TRADE', WAIT: 'WAIT', NO_TRADE: 'NO TRADE' };

  // Now momentum color — based on nowBias direction, NOT mainDirection
  const nowColor = nowBias === 'BUY' ? 'text-primary' : nowBias === 'SELL' ? 'text-destructive' : 'text-muted-foreground';
  const nowScoreColor = plusMinusScore > 0 ? 'text-primary' : plusMinusScore < 0 ? 'text-destructive' : 'text-muted-foreground';

  function strengthColor(direction, strength) {
    const isBuy  = direction === 'BUY'  || direction === 'BULL';
    const isSell = direction === 'SELL' || direction === 'BEAR';
    if (!isBuy && !isSell) return 'text-muted-foreground';
    if (isBuy) {
      if (strength === 'STRONG') return 'text-primary';
      if (strength === 'MEDIUM') return 'text-primary/80';
      if (strength === 'WEAK')   return 'text-primary/50';
      return 'text-muted-foreground';
    }
    if (strength === 'STRONG') return 'text-destructive';
    if (strength === 'MEDIUM') return 'text-orange-500';
    if (strength === 'WEAK')   return 'text-destructive/50';
    return 'text-muted-foreground';
  }

  const statusBadge = status === 'Ready' || status === 'Scalp'
    ? 'bg-primary/15 text-primary border-primary/30'
    : status === 'Wait' || status === 'Weak'
    ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30'
    : 'bg-secondary text-muted-foreground border-border';

  return (
    <div className="space-y-2.5">

      {/* ── MAIN RESULT CARD ── Split layout */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="flex min-h-[100px]">

          {/* Left — Grade */}
          <div className="flex flex-col items-center justify-center px-4 py-3 bg-secondary/40 border-r border-border min-w-[76px]">
            <span className="text-4xl font-black tracking-tight text-foreground leading-none">{grade}</span>
            <span className="text-[10px] font-medium text-muted-foreground mt-1 text-center leading-tight">{gradeLabel}</span>
          </div>

          {/* Right — Decision info */}
          <div className="flex flex-col justify-center px-3 py-3 flex-1 gap-2">
            {/* Status badge */}
            <span className={cn('self-start text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', statusBadge)}>
              {status}
            </span>

            {/* Grid: label → value */}
            <div className="grid items-center gap-y-1.5" style={{ gridTemplateColumns: '80px 1fr' }}>
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Direction</span>
              <span className={cn('text-sm font-bold', dirColor)}>{mainDirection}</span>

              <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Action</span>
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded self-start w-fit', actionColors[tradeAction])}>
                {tradeAction === 'NO_TRADE' ? 'NO TRADE' : tradeAction}
              </span>

              <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Target</span>
              <span className="text-[11px] font-mono font-semibold text-foreground">{targetNote || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── BLOCK BREAKDOWN ── */}
      <div>
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">Block Breakdown</div>
        <div className="grid grid-cols-3 gap-1.5">
          <TrendPill label="Deep" value={deepTrend} sub={deepStrength} />
          <TrendPill label="DD" value={ddBias} sub={ddStrength} />
          <TrendPill label="Now" value={nowBias} sub={nowStrength} />
        </div>
      </div>

      {/* ── BACKEND SCORE (optional) ── */}
      {settings?.showBackendScore && (
        <div className="rounded-lg border border-border bg-secondary/40 p-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Score</span>
            <span className="font-mono font-semibold text-foreground">{winningScore ?? 0} pts</span>
          </div>
        </div>
      )}

      {/* ── WARNINGS ── */}
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-50/80 dark:bg-amber-500/8 border border-amber-200/60 dark:border-amber-500/15 p-2.5 text-xs text-amber-800 dark:text-amber-300 backdrop-blur-sm">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-70" />
              <span className="leading-snug">{w}</span>
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
    if (strength === 'STRONG') return 'text-primary';
    if (strength === 'MEDIUM') return 'text-primary/80';
    if (strength === 'WEAK')   return 'text-primary/50';
    return 'text-muted-foreground';
  }
  if (strength === 'STRONG') return 'text-destructive';
  if (strength === 'MEDIUM') return 'text-orange-500';
  if (strength === 'WEAK')   return 'text-destructive/50';
  return 'text-muted-foreground';
}

function TrendPill({ label, value, sub }) {
  const color = value === 'BUY' || value === 'BULL' ? 'text-primary'
    : value === 'SELL' || value === 'BEAR' ? 'text-destructive'
    : 'text-foreground/40';
  return (
    <div className="rounded-lg bg-secondary/50 border border-border/70 p-2 text-center shadow-sm">
      <div className="text-[8px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">{label}</div>
      <div className={cn('text-[12px] font-bold leading-tight', color)}>{value || '—'}</div>
      {sub && <div className={cn('text-[8px] mt-0.5 leading-tight', strengthColor(value, sub))}>{sub}</div>}
    </div>
  );
}