import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, MinusCircle } from 'lucide-react';

export default function AssetsList({ analyses }) {
  if (!analyses || analyses.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Header Row */}
      <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold border-b border-border">
        <div className="col-span-2">Pair</div>
        <div className="col-span-1 text-center">Dir</div>
        <div className="col-span-1 text-center">Grade</div>
        <div className="col-span-1 text-center">Score</div>
        <div className="col-span-4 text-center">Trend</div>
        <div className="col-span-2 text-right">Action</div>
      </div>

      {/* Data Rows */}
      {analyses.map(a => {
        const { instrument, results } = a;
        if (!results) return null;

        const { mainDirection, grade, confidenceScore, tradeAction, deepTrend, ddBias, nowBias } = results;
        const dirColor = mainDirection === 'BUY' ? 'text-emerald-400' : mainDirection === 'SELL' ? 'text-red-400' : 'text-muted-foreground';
        const actionColor = tradeAction === 'TRADE' ? 'bg-emerald-500 text-white' : tradeAction === 'WAIT' ? 'bg-yellow-500 text-black' : 'bg-red-500 text-white';

        return (
          <div key={instrument} className="grid grid-cols-12 gap-2 items-center px-3 py-2 bg-card/50 rounded-lg border border-border/50 hover:border-border/80 transition-colors">
            {/* Pair */}
            <div className="col-span-2">
              <div className="font-semibold text-sm">{instrument}</div>
            </div>

            {/* Direction */}
            <div className="col-span-1 flex justify-center">
              <div className={cn('flex items-center justify-center w-6 h-6 rounded', mainDirection === 'BUY' ? 'bg-secondary' : mainDirection === 'SELL' ? 'bg-secondary' : 'bg-secondary')}>
                {mainDirection === 'BUY' ? <TrendingUp className="w-4 h-4 text-foreground" /> : mainDirection === 'SELL' ? <TrendingDown className="w-4 h-4 text-foreground" /> : <MinusCircle className="w-4 h-4 text-foreground" />}
              </div>
            </div>

            {/* Grade */}
            <div className="col-span-1 text-center">
              <div className="font-bold text-sm">{grade}</div>
            </div>

            {/* Score */}
            <div className="col-span-1 text-center">
              <div className="font-mono text-sm font-semibold">{confidenceScore}</div>
            </div>

            {/* Trend (Deep / DD / Now) */}
            <div className="col-span-4">
              <div className="flex justify-center gap-3 text-[11px]">
                <div className="text-center">
                  <div className="text-[8px] text-muted-foreground">Deep</div>
                  <div className={cn('font-bold', deepTrend === 'BULL' ? 'text-emerald-400' : deepTrend === 'BEAR' ? 'text-red-400' : 'text-muted-foreground')}>
                    {deepTrend || '—'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[8px] text-muted-foreground">DD</div>
                  <div className={cn('font-bold', ddBias === 'BUY' ? 'text-emerald-400' : ddBias === 'SELL' ? 'text-red-400' : 'text-muted-foreground')}>
                    {ddBias || '—'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[8px] text-muted-foreground">Now</div>
                  <div className={cn('font-bold', nowBias === 'BUY' ? 'text-emerald-400' : nowBias === 'SELL' ? 'text-red-400' : 'text-muted-foreground')}>
                    {nowBias || '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Action */}
            <div className="col-span-2 flex justify-end">
              <div className={cn('px-3 py-1 rounded text-xs font-bold', actionColor)}>
                {tradeAction === 'TRADE' ? 'TRADE' : tradeAction === 'WAIT' ? 'WAIT' : 'NO TRADE'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}