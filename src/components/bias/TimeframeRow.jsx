import React from 'react';
import { cn } from '@/lib/utils';
import IndicatorButton from './IndicatorButton';

export default function TimeframeRow({ tf, indicators, onChange, result }) {
  const handleChange = (indicator, value) => {
    onChange(tf.key, { ...indicators, [indicator]: value });
  };

  const biasColor = result?.bias === 'BUY' ? 'text-emerald-400' : result?.bias === 'SELL' ? 'text-red-400' : 'text-muted-foreground';
  const isBS = tf.group === 'broadstroke';

  return (
    <div className={cn(
      'grid grid-cols-6 gap-2 items-center py-2 px-3 rounded-lg',
      isBS ? 'bg-secondary/50' : 'bg-accent/30'
    )}>
      <div className="col-span-1">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{isBS ? 'BS' : 'TR'}</div>
        <div className="font-semibold text-sm">{tf.shortLabel}</div>
      </div>
      <div className="col-span-4 grid grid-cols-4 gap-1.5">
        {tf.key === 'h1' || tf.key === 'm15' || tf.key === 'm5' ? (
          <>
            <div className="opacity-30">
              <IndicatorButton value={0} onChange={() => {}} label="Close" />
            </div>
            <IndicatorButton value={indicators.macd} onChange={(v) => handleChange('macd', v)} label="MACD" />
            <IndicatorButton value={indicators.rsi} onChange={(v) => handleChange('rsi', v)} label="RSI" />
            <IndicatorButton value={indicators.boli} onChange={(v) => handleChange('boli', v)} label="Boli" />
          </>
        ) : (
          <>
            <IndicatorButton value={indicators.close} onChange={(v) => handleChange('close', v)} label="Close" />
            <IndicatorButton value={indicators.macd} onChange={(v) => handleChange('macd', v)} label="MACD" />
            <IndicatorButton value={indicators.rsi} onChange={(v) => handleChange('rsi', v)} label="RSI" />
            <IndicatorButton value={indicators.boli} onChange={(v) => handleChange('boli', v)} label="Boli" />
          </>
        )}
      </div>
      <div className="col-span-1 text-center">
        <div className={cn('font-bold text-sm', biasColor)}>
          {result?.bias || '—'}
        </div>
        <div className="text-[10px] text-muted-foreground font-mono">
          {result?.total || 0}
        </div>
      </div>
    </div>
  );
}