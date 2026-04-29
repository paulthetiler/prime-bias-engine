import React from 'react';
import { cn } from '@/lib/utils';
import { TIMEFRAMES, TF_GRADE_WEIGHTS } from '@/lib/biasEngine';

export default function EngineBreakdown({ results }) {
  if (!results) return null;

  const { timeframes, posScore, negScore, mainDirection, confidenceScore } = results;

  return (
    <div className="space-y-4">
      {/* Section Headers */}
      <Section title="Broadstroke (Deep Trend)" subtitle="M / W / D">
        {TIMEFRAMES.filter(tf => tf.group === 'broadstroke').map(tf => (
          <TFRow key={tf.key} tf={tf} data={timeframes[tf.key]} />
        ))}
      </Section>

      <Section title="Trigger (Execution)" subtitle="4H / 1H / 15m / 5m">
        {TIMEFRAMES.filter(tf => tf.group === 'trigger').map(tf => (
          <TFRow key={tf.key} tf={tf} data={timeframes[tf.key]} />
        ))}
      </Section>

      {/* Grading Breakdown */}
      <div className="rounded-lg bg-card border border-border p-4">
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Grading Weights</h3>
        <div className="space-y-1.5">
          {TIMEFRAMES.map(tf => {
            const weight = TF_GRADE_WEIGHTS[tf.key];
            const result = timeframes[tf.key]?.result || 0;
            const contrib = result === 1 ? weight : result === -1 ? weight : 0;
            const side = result === 1 ? 'POS' : result === -1 ? 'NEG' : '—';
            return (
              <div key={tf.key} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground w-12">{tf.shortLabel}</span>
                <span className="text-muted-foreground">wt: {weight}</span>
                <span className={cn(
                  'font-mono font-semibold',
                  result === 1 ? 'text-emerald-400' : result === -1 ? 'text-red-400' : 'text-muted-foreground'
                )}>{side}: {contrib}</span>
              </div>
            );
          })}
          <div className="border-t border-border pt-2 mt-2 flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span className="font-mono">
              <span className="text-emerald-400">+{posScore}</span>
              {' / '}
              <span className="text-red-400">−{negScore}</span>
              {' → '}
              <span className={mainDirection === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>{confidenceScore}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div className="rounded-lg bg-card border border-border p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
        <span className="text-[10px] text-muted-foreground">{subtitle}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function TFRow({ tf, data }) {
  if (!data) return null;
  const { indicators, total, result, bias } = data;
  const biasColor = bias === 'BUY' ? 'text-emerald-400' : bias === 'SELL' ? 'text-red-400' : 'text-muted-foreground';

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs font-semibold w-8">{tf.shortLabel}</span>
        <div className="flex gap-2 text-[10px] font-mono">
          <Pill value={indicators.close} label="C" />
          <Pill value={indicators.macd} label="M" />
          <Pill value={indicators.rsi} label="R" />
          <Pill value={indicators.boli} label="B" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-muted-foreground">{total}</span>
        <span className={cn('text-xs font-bold min-w-[32px] text-right', biasColor)}>{bias || '—'}</span>
      </div>
    </div>
  );
}

function Pill({ value, label }) {
  return (
    <span className={cn(
      'inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold',
      value === 1 && 'bg-emerald-500/20 text-emerald-400',
      value === -1 && 'bg-red-500/20 text-red-400',
      value === 0 && 'bg-secondary text-muted-foreground'
    )}>
      {value === 1 ? '+' : value === -1 ? '−' : '0'}
    </span>
  );
}