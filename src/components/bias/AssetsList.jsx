import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, MinusCircle } from 'lucide-react';

export default function AssetsList({ analyses }) {
  if (!analyses || analyses.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Header Row */}
      <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold border-b border-border">
        <div className="col-span-3">Pair</div>
        <div className="col-span-1 text-center">Dir</div>
        <div className="col-span-1 text-center">Gr</div>
        <div className="col-span-3 text-center">Trend</div>
        <div className="col-span-4 text-right">Action</div>
      </div>

      {/* Data Rows */}
      {analyses.map(a => {
        const { instrument, results } = a;
        if (!results) return null;

        const { mainDirection, grade, tradeAction, deepTrend, ddBias, nowBias } = results;
        const dirColor = mainDirection === 'BUY' ? 'text-emerald-400' : mainDirection === 'SELL' ? 'text-red-400' : 'text-muted-foreground';
        const actionColor = tradeAction === 'TRADE' ? 'bg-emerald-500 text-white' : tradeAction === 'WAIT' ? 'bg-yellow-500 text-black' : 'bg-red-500 text-white';

        return (
          <div key={instrument} className="grid grid-cols-12 gap-1 items-center px-2 py-2 bg-card/50 rounded-lg border border-border/50 hover:border-border/80 transition-colors">
            {/* Pair */}
            <div className="col-span-3 min-w-0">
              <div className="font-semibold text-xs truncate">{instrument}</div>
            </div>

            {/* Direction */}
            <div className="col-span-1 flex justify-center">
              {mainDirection === 'BUY' ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : mainDirection === 'SELL' ? <TrendingDown className="w-4 h-4 text-red-400" /> : <MinusCircle className="w-4 h-4 text-muted-foreground" />}
            </div>

            {/* Grade */}
            <div className="col-span-1 text-center">
              <div className="font-bold text-sm">{grade}</div>
            </div>

            {/* Trend (Deep / DD / Now) */}
            <div className="col-span-3">
              <div className="flex justify-center gap-1.5">
                <div className="text-center">
                  <div className="text-[7px] text-muted-foreground">D</div>
                  <div className={cn('text-[10px] font-bold leading-tight', deepTrend === 'BULL' ? 'text-emerald-400' : deepTrend === 'BEAR' ? 'text-red-400' : 'text-muted-foreground')}>
                    {deepTrend === 'BULL' ? 'B' : deepTrend === 'BEAR' ? 'S' : '—'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[7px] text-muted-foreground">DD</div>
                  <div className={cn('text-[10px] font-bold leading-tight', ddBias === 'BUY' ? 'text-emerald-400' : ddBias === 'SELL' ? 'text-red-400' : 'text-muted-foreground')}>
                    {ddBias === 'BUY' ? 'B' : ddBias === 'SELL' ? 'S' : '—'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[7px] text-muted-foreground">N</div>
                  <div className={cn('text-[10px] font-bold leading-tight', nowBias === 'BUY' ? 'text-emerald-400' : nowBias === 'SELL' ? 'text-red-400' : 'text-muted-foreground')}>
                    {nowBias === 'BUY' ? 'B' : nowBias === 'SELL' ? 'S' : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Action */}
            <div className="col-span-4 flex justify-end">
              <div className={cn('px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap', actionColor)}>
                {tradeAction === 'TRADE' ? 'TRADE' : tradeAction === 'WAIT' ? 'WAIT' : 'NO TRADE'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}