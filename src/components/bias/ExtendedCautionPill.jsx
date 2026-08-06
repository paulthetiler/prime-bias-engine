import React from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

// Amber "⚠ CAUTION" pill for an Extended / grade-F result. Extended is a VALID
// directional setup that just needs extra care — this pill is quick visual
// awareness only, never a danger / no-trade signal (so: amber, never red). It
// does not affect the BUY/SELL Action; the full explanation lives in the
// result's warning banner. Callers pass `className` to tune the size for tighter
// layouts (twMerge lets it override the defaults below).
export default function ExtendedCautionPill({ className }) {
  return (
    <span
      title="Market is extended — valid setup, but be careful with entry and risk."
      className={cn(
        'inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
        className,
      )}
    >
      <AlertTriangle className="w-2.5 h-2.5" /> Caution
    </span>
  );
}

// Whether a result warrants the Extended caution treatment: the engine's
// 'Extended' status, or an effective grade of F. Kept here so every surface
// (Bias Result card, Summary card, detail modal) uses one rule.
export const isExtendedCaution = (results) =>
  results?.status === 'Extended' || results?.grade === 'F';
