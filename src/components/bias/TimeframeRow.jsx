import React from 'react';
import { cn } from '@/lib/utils';
import IndicatorButton from './IndicatorButton';

export default function TimeframeRow({ tf, indicators, onChange, result, inputStyle = 'tap-cycle' }) {
  const handleChange = (indicator, value) => {
    onChange(tf.key, { ...indicators, [indicator]: value });
  };

  const biasColor = result?.bias === 'BUY' ? 'text-emerald-400' : result?.bias === 'SELL' ? 'text-red-400' : 'text-muted-foreground';
  const isBS = tf.group === 'broadstroke';

  return (
    <div className={cn(
      'flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg',
      isBS ? 'bg-secondary/50' : 'bg-accent/20'
    )}>
      {/* Label */}
      <div className="w-7 shrink-0">
        <div className="text-[8px] text-muted-foreground/60 uppercase tracking-wider leading-tight">{isBS ? 'BS' : 'TR'}</div>
        <div className="font-semibold text-[13px] leading-tight text-foreground">{tf.shortLabel}</div>
      </div>

      {/* Buttons */}
      <div className="flex gap-1 flex-1 min-w-0">
        {tf.key === 'h1' || tf.key === 'm15' || tf.key === 'm5' ? (
          <>
            <div className="flex-1 opacity-25 pointer-events-none">
              <IndicatorButton value={0} onChange={() => {}} label="Close" inputStyle={inputStyle} />
            </div>
            <div className="flex-1"><IndicatorButton value={indicators.macd} onChange={(v) => handleChange('macd', v)} label="MACD" inputStyle={inputStyle} /></div>
            <div className="flex-1"><IndicatorButton value={indicators.rsi} onChange={(v) => handleChange('rsi', v)} label="RSI" inputStyle={inputStyle} /></div>
            <div className="flex-1"><IndicatorButton value={indicators.boli} onChange={(v) => handleChange('boli', v)} label="Boli" inputStyle={inputStyle} /></div>
          </>
        ) : (
          <>
            <div className="flex-1"><IndicatorButton value={indicators.close} onChange={(v) => handleChange('close', v)} label="Close" inputStyle={inputStyle} /></div>
            <div className="flex-1"><IndicatorButton value={indicators.macd} onChange={(v) => handleChange('macd', v)} label="MACD" inputStyle={inputStyle} /></div>
            <div className="flex-1"><IndicatorButton value={indicators.rsi} onChange={(v) => handleChange('rsi', v)} label="RSI" inputStyle={inputStyle} /></div>
            <div className="flex-1"><IndicatorButton value={indicators.boli} onChange={(v) => handleChange('boli', v)} label="Boli" inputStyle={inputStyle} /></div>
          </>
        )}
      </div>

      {/* Bias result */}
      <div className="w-11 shrink-0 text-right">
        <div className={cn('font-semibold text-[11px] leading-tight', biasColor === 'text-muted-foreground' ? 'text-foreground/50' : biasColor)}>
          {result?.bias || '—'}
        </div>
        <div className="text-[9px] text-muted-foreground/70 font-mono">
          {result?.total ?? 0}
        </div>
      </div>
    </div>
  );
}