import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, MinusCircle } from 'lucide-react';
import { TIMEFRAMES } from '@/lib/biasEngine';

export default function LiveGrid({ analyses }) {
  if (!analyses || analyses.length === 0) return null;

  // Group all timeframes by asset
  const gridData = analyses.flatMap(a => {
    if (!a.results) return [];
    const { timeframes } = a.results;
    return TIMEFRAMES.map(tf => ({
      instrument: a.instrument,
      tf,
      data: timeframes[tf.key],
      overall: a.results
    }));
  });

  // Summary stats
  const summary = analyses.reduce((acc, a) => {
    if (!a.results) return acc;
    const { mainDirection, grade, tradeAction } = a.results;
    return {
      buys: acc.buys + (mainDirection === 'BUY' ? 1 : 0),
      sells: acc.sells + (mainDirection === 'SELL' ? 1 : 0),
      trades: acc.trades + (tradeAction === 'TRADE' ? 1 : 0),
      avgGrade: acc.avgGrade + (grade ? grade.charCodeAt(0) : 70),
      total: acc.total + 1
    };
  }, { buys: 0, sells: 0, trades: 0, avgGrade: 0, total: 0 });

  const avgGradeChar = String.fromCharCode(Math.round(summary.avgGrade / Math.max(summary.total, 1)));

  return (
    <div className="space-y-4">
      {/* Live Grid */}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-secondary border-b border-border">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-16">Pair</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-12">TF</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground w-10">C</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground w-10">M</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground w-10">R</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground w-10">B</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground w-10">Σ</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground w-12">Bias</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground flex-1">Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {gridData.map((row, idx) => {
              const { instrument, tf, data, overall } = row;
              const isFirstRow = idx === 0 || gridData[idx - 1].instrument !== instrument;
              const isLastRow = idx === gridData.length - 1 || gridData[idx + 1].instrument !== instrument;

              if (!data) return null;

              const { indicators, total, bias } = data;
              const biasColor = bias === 'BUY' ? 'text-emerald-400' : bias === 'SELL' ? 'text-red-400' : 'text-muted-foreground';
              const mainDirColor = overall.mainDirection === 'BUY' ? 'text-emerald-400' : overall.mainDirection === 'SELL' ? 'text-red-400' : 'text-muted-foreground';

              return (
                <tr key={`${instrument}-${tf.key}`} className="hover:bg-accent/30 transition-colors">
                  {/* Pair (only show once per asset) */}
                  {isFirstRow ? (
                    <td className="px-3 py-2 font-semibold align-top" rowSpan={TIMEFRAMES.length}>
                      <div className="text-sm">{instrument}</div>
                    </td>
                  ) : null}

                  {/* Timeframe */}
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground">{tf.shortLabel}</td>

                  {/* Input indicators */}
                  <td className="px-2 py-2 text-center">
                    <Indicator value={indicators.close} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <Indicator value={indicators.macd} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <Indicator value={indicators.rsi} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <Indicator value={indicators.boli} />
                  </td>

                  {/* Total */}
                  <td className="px-2 py-2 text-center text-xs font-mono text-muted-foreground">{total}</td>

                  {/* Bias */}
                  <td className={cn('px-2 py-2 text-center text-xs font-bold', biasColor)}>{bias || '—'}</td>

                  {/* Summary (only show once per asset) */}
                  {isFirstRow && isLastRow ? (
                    <td className="px-3 py-2 align-top" rowSpan={TIMEFRAMES.length}>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Grade:</span>
                          <span className="font-bold">{overall.grade}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Score:</span>
                          <span className="font-mono font-bold">{overall.confidenceScore}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn('text-muted-foreground font-bold', mainDirColor)}>{overall.mainDirection}</span>
                          <span className={cn('px-2 py-1 rounded text-[10px] font-bold', overall.tradeAction === 'TRADE' ? 'bg-emerald-500 text-white' : overall.tradeAction === 'WAIT' ? 'bg-yellow-500 text-black' : 'bg-red-500 text-white')}>
                            {overall.tradeAction === 'TRADE' ? 'TRADE' : overall.tradeAction === 'WAIT' ? 'WAIT' : 'NO TRADE'}
                          </span>
                        </div>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary Panel */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-3 space-y-2">
          <div className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Activity</div>
          <div className="flex justify-between text-sm">
            <div>
              <div className="text-emerald-400 font-bold">{summary.buys}</div>
              <div className="text-[10px] text-muted-foreground">BUY</div>
            </div>
            <div>
              <div className="text-red-400 font-bold">{summary.sells}</div>
              <div className="text-[10px] text-muted-foreground">SELL</div>
            </div>
            <div>
              <div className="text-yellow-400 font-bold">{summary.trades}</div>
              <div className="text-[10px] text-muted-foreground">TRADE</div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-3 space-y-2">
          <div className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Stats</div>
          <div className="flex justify-between text-sm">
            <div>
              <div className="font-bold">{summary.total}</div>
              <div className="text-[10px] text-muted-foreground">Assets</div>
            </div>
            <div>
              <div className="font-bold">{avgGradeChar}</div>
              <div className="text-[10px] text-muted-foreground">Avg Grade</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Indicator({ value }) {
  return (
    <span className={cn(
      'inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold',
      value === 1 && 'bg-emerald-500/20 text-emerald-400',
      value === -1 && 'bg-red-500/20 text-red-400',
      value === 0 && 'bg-secondary text-muted-foreground'
    )}>
      {value === 1 ? '+' : value === -1 ? '−' : '0'}
    </span>
  );
}