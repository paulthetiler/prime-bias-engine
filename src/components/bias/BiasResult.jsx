import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, XCircle, MinusCircle } from 'lucide-react';

export default function BiasResult({ results }) {
  if (!results) return null;

  const { mainDirection, grade, gradeLabel, confidenceScore, tradeAction, status, strength, deepTrend, deepStrength, ddBias, ddStrength, nowBias, nowStrength, warnings, targetNote, extraCheckPass, extraCheckNote } = results;

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

  return (
    <div className="space-y-3">
      {/* Main Result Card */}
      <div className={cn('rounded-xl border-2 p-4 text-center', dirBg)}>
        <div className="flex items-center justify-center gap-2 mb-1">
          {mainDirection === 'BUY' ? <TrendingUp className="w-6 h-6 text-emerald-400" /> : mainDirection === 'SELL' ? <TrendingDown className="w-6 h-6 text-red-400" /> : <MinusCircle className="w-6 h-6" />}
          <span className={cn('text-3xl font-bold', dirColor)}>{mainDirection}</span>
        </div>
        <div className="text-sm text-muted-foreground">{strength} signal</div>
      </div>

      {/* Grade + Target + Action Row */}
      <div className="grid grid-cols-3 gap-2">
       <div className={cn('rounded-lg border p-3 text-center', gradeColors[grade])}>
         <div className="text-3xl font-bold">{grade}</div>
         <div className="text-[10px] uppercase tracking-wider opacity-70">{gradeLabel}</div>
       </div>
       <div className="rounded-lg border border-border bg-secondary p-3 text-center">
         <div className="text-3xl font-bold font-mono">{targetNote || '—'}</div>
         <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Target</div>
       </div>
       <div className={cn('rounded-lg p-3 text-center flex flex-col items-center justify-center', actionColors[tradeAction])}>
         <div className="text-lg font-bold">{actionLabels[tradeAction]}</div>
         <div className="text-[10px] uppercase tracking-wider opacity-80">{status}</div>
       </div>
      </div>

      {/* Trend Breakdown */}
      <div className="grid grid-cols-3 gap-2">
        <TrendPill label="Deep" value={deepTrend} sub={deepStrength} />
        <TrendPill label="DD" value={ddBias} sub={ddStrength} />
        <TrendPill label="Now" value={nowBias} sub={nowStrength} />
      </div>

      {/* Extra Check */}
      <div className={cn(
        'rounded-lg border p-3 text-xs',
        extraCheckPass
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          : 'bg-red-500/10 border-red-500/30 text-red-300'
      )}>
        <div className="font-semibold mb-0.5">Extra Check</div>
        <div>{extraCheckNote}</div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1.5">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-2.5 text-xs text-yellow-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrendPill({ label, value, sub }) {
  const color = value === 'BUY' || value === 'BULL' ? 'text-emerald-400' : value === 'SELL' || value === 'BEAR' ? 'text-red-400' : 'text-muted-foreground';
  return (
    <div className="rounded-lg bg-secondary/80 border border-border p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('text-sm font-bold', color)}>{value || '—'}</div>
      {sub && <div className="text-[9px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}