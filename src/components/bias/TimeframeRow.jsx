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
      'flex items-center gap-2 py-2 px-3 rounded-lg',
      isBS ? 'bg-secondary/50' : 'bg-accent/30'
    )}>
      {/* Label */}
      <div className="w-8 shrink-0">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wider leading-tight">{isBS ? 'BS' : 'TR'}</div>
        <div className="font-bold text-sm leading-tight">{tf.shortLabel}</div>
      </div>

      {/* Buttons */}
      <div className="flex gap-1.5 flex-1 min-w-0">
        {tf.key === 'h1' || tf.key === 'm15' || tf.key === 'm5' ? (
          <>
            <div className="flex-1 opacity-30">
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
      <div className="w-10 shrink-0 text-right">
        <div className={cn('font-bold text-xs leading-tight', biasColor)}>
          {result?.bias || '—'}
        </div>
        <div className="text-[10px] text-muted-foreground font-mono">
          {result?.total ?? 0}
        </div>
      </div>
    </div>
  );
}