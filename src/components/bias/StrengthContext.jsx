import React from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildPairStrengthContext } from '@/lib/strengthContext';

// Container/label colours per state. FADING is amber, never red — this block is
// context, not a warning.
const TONE = {
  supporting: {
    box: 'border-emerald-500/25 bg-emerald-500/10',
    label: 'text-emerald-700 dark:text-emerald-400',
  },
  mixed: {
    box: 'border-border bg-secondary/50',
    label: 'text-amber-600 dark:text-amber-400',
  },
  fading: {
    box: 'border-amber-500/30 bg-amber-500/10',
    label: 'text-amber-700 dark:text-amber-400',
  },
};

// Informational-only strength read-out for the full decision view. Renders
// nothing when the instrument is not an eight-currency FX pair or when strength
// data is unavailable. It never influences score, grade, direction, readiness or
// the trade action — those come solely from the Prime Bias engine.
export default function StrengthContext({ instrument, strengthData }) {
  const today = strengthData?.windows?.today;
  const context = buildPairStrengthContext({
    instrument,
    todayStrengths: today?.strengths,
    referenceStrengths: strengthData?.windows?.['4h']?.strengths,
    separations: today?.separations,
  });
  if (!context) return null;

  const tone = TONE[context.tone] || TONE.mixed;

  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Strength Context</div>
      <div className={cn('rounded-lg border p-3', tone.box)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Zap className={cn('w-3.5 h-3.5', tone.label)} />
            <span className={cn('text-[10px] font-black tracking-wide', tone.label)}>{context.state}</span>
          </div>
          <span className="text-[9px] font-black uppercase tracking-wide text-muted-foreground">
            {context.separationLabel} SEP · {context.separation.toFixed(2)}%
          </span>
        </div>
        <p className="text-xs text-foreground leading-snug mt-1.5">{context.reason}</p>
        <p className="text-[9px] text-muted-foreground mt-1.5">
          Currency strength context — informational only. Direction still comes from Prime Bias.
        </p>
      </div>
    </div>
  );
}
