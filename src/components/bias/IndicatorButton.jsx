import React from 'react';
import { cn } from '@/lib/utils';

// Tri-state button: 0 → 1 → -1 → 0 (matches Excel: UP=1 DOWN=-1 NEUTRAL=0)
export default function IndicatorButton({ value, onChange, label }) {
  const cycle = () => {
    if (value === 0) onChange(1);
    else if (value === 1) onChange(-1);
    else onChange(0);
  };

  return (
    <button
      onClick={cycle}
      className={cn(
        'w-full h-12 rounded-lg font-mono text-sm font-semibold transition-all duration-150 active:scale-95 border-2',
        value === 1 && 'bg-emerald-500/20 border-emerald-500 text-emerald-400',
        value === -1 && 'bg-red-500/20 border-red-500 text-red-400',
        value === 0 && 'bg-secondary border-border text-muted-foreground'
      )}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-base">
        {value === 1 ? '+1' : value === -1 ? '−1' : '0'}
      </div>
    </button>
  );
}