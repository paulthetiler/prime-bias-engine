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
        'w-full h-10 rounded-md font-mono font-semibold transition-all duration-150 active:scale-95 border flex flex-col items-center justify-center gap-0',
        value === 1 && 'bg-primary/10 border-primary/60 text-primary',
        value === -1 && 'bg-destructive/10 border-destructive/60 text-destructive',
        value === 0 && 'bg-secondary border-border text-muted-foreground/60'
      )}
    >
      <div className="text-[8px] uppercase tracking-wide font-semibold opacity-60 leading-none">{label}</div>
      <div className="text-[13px] font-bold leading-none mt-0.5">
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