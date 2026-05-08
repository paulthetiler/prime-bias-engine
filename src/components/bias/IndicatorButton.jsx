import React from 'react';
import { cn } from '@/lib/utils';

// Tap-cycle: 0 → 1 → -1 → 0
function TapCycleButton({ value, onChange, label }) {
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
        value === 1 && 'bg-primary/15 border-primary text-primary',
        value === -1 && 'bg-destructive/15 border-destructive text-destructive',
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

// Button style: 3 explicit buttons
function ButtonStyleInput({ value, onChange, label }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-center">{label}</div>
      <div className="flex gap-1">
        <button
          onClick={() => onChange(1)}
          className={cn(
            'flex-1 h-8 rounded text-[10px] font-bold border transition-colors',
            value === 1
              ? 'bg-primary text-white border-primary'
              : 'bg-secondary border-border text-muted-foreground hover:border-primary/50'
          )}
        >B</button>
        <button
          onClick={() => onChange(0)}
          className={cn(
            'flex-1 h-8 rounded text-[10px] font-bold border transition-colors',
            value === 0
              ? 'bg-secondary border-foreground text-foreground'
              : 'bg-secondary border-border text-muted-foreground'
          )}
        >N</button>
        <button
          onClick={() => onChange(-1)}
          className={cn(
            'flex-1 h-8 rounded text-[10px] font-bold border transition-colors',
            value === -1
              ? 'bg-destructive text-white border-destructive'
              : 'bg-secondary border-border text-muted-foreground hover:border-destructive/50'
          )}
        >S</button>
      </div>
    </div>
  );
}

export default function IndicatorButton({ value, onChange, label, inputStyle = 'tap-cycle' }) {
  if (inputStyle === 'buttons') {
    return <ButtonStyleInput value={value} onChange={onChange} label={label} />;
  }
  return <TapCycleButton value={value} onChange={onChange} label={label} />;
}