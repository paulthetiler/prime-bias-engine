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
      <div className="overflow-x-auto border border-border rounded-lg bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-secondary">
              <th className="px-3 py-2 text-left font-semibold text-foreground text-xs">Pair</th>
              <th className="px-2 py-2 text-center font-semibold text-foreground text-xs w-8">TF</th>
              <th className="px-2 py-2 text-center font-semibold text-muted-foreground text-[10px] w-10">Close</th>
              <th className="px-2 py-2 text-center font-semibold text-muted-foreground text-[10px] w-10">MACD</th>
              <th className="px-2 py-2 text-center font-semibold text-muted-foreground text-[10px] w-10">RSI</th>
              <th className="px-2 py-2 text-center font-semibold text-muted-foreground text-[10px] w-10">Boli</th>
              <th className="px-2 py-2 text-center font-semibold text-foreground text-xs w-8">Total</th>
              <th className="px-2 py-2 text-center font-semibold text-foreground text-xs min-w-16">Bias</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground text-xs flex-1">Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {gridData.map((row, idx) => {
              const { instrument, tf, data, overall } = row;
              const isFirstRow = idx === 0 || gridData[idx - 1].instrument !== instrument;
              const isLastRow = idx === gridData.length - 1 || gridData[idx + 1].instrument !== instrument;

              if (!data) return null;

              const { indicators, total, bias } = data;
              const biasBg = bias === 'BUY' ? 'bg-emerald-500/15 text-emerald-400' : bias === 'SELL' ? 'bg-red-500/15 text-red-400' : 'bg-secondary text-muted-foreground';

              return (
                <tr key={`${instrument}-${tf.key}`} className="hover:bg-accent/30 transition-colors">
                  {/* Pair (only show once per asset) */}
                  {isFirstRow ? (
                    <td className="px-3 py-2 font-semibold text-foreground align-top" rowSpan={TIMEFRAMES.length}>
                      {instrument}
                    </td>
                  ) : null}

                  {/* Timeframe */}
                  <td className="px-2 py-2 text-center text-sm text-muted-foreground">{tf.shortLabel}</td>

                  {/* Input indicators */}
                  <td className="px-2 py-2 text-center">
                    <IndicatorBox value={indicators.close} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <IndicatorBox value={indicators.macd} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <IndicatorBox value={indicators.rsi} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <IndicatorBox value={indicators.boli} />
                  </td>

                  {/* Total */}
                  <td className="px-2 py-2 text-center text-sm font-mono text-muted-foreground">{total}</td>

                  {/* Bias */}
                  <td className={cn('px-2 py-2 text-center text-sm font-semibold rounded', biasBg)}>
                    {bias || '—'}
                  </td>

                  {/* Summary (only show once per asset) */}
                  {isFirstRow && isLastRow ? (
                    <td className="px-3 py-2 align-top" rowSpan={TIMEFRAMES.length}>
                      <div className="space-y-1.5">
                        <div>
                          <div className="text-[10px] text-muted-foreground">Grade</div>
                          <div className="text-lg font-bold text-foreground">{overall.grade}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">Score</div>
                          <div className="font-mono font-bold text-foreground">{overall.confidenceScore}</div>
                        </div>
                        <div className={cn('px-2 py-1 rounded text-xs font-bold text-white text-center', overall.tradeAction === 'TRADE' ? 'bg-emerald-500' : overall.tradeAction === 'WAIT' ? 'bg-amber-500' : 'bg-red-500')}>
                          {overall.tradeAction}
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
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity</div>
          <div className="flex justify-between text-sm">
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-400">{summary.buys}</div>
              <div className="text-[10px] text-muted-foreground">BUY</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-400">{summary.sells}</div>
              <div className="text-[10px] text-muted-foreground">SELL</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-amber-400">{summary.trades}</div>
              <div className="text-[10px] text-muted-foreground">TRADE</div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stats</div>
          <div className="flex justify-between text-sm">
            <div className="text-center">
              <div className="text-lg font-bold text-foreground">{summary.total}</div>
              <div className="text-[10px] text-muted-foreground">Assets</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-foreground">{avgGradeChar}</div>
              <div className="text-[10px] text-muted-foreground">Avg Grade</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IndicatorBox({ value }) {
  const bgColor = value === 1 ? 'bg-emerald-500/20' : value === -1 ? 'bg-red-500/20' : 'bg-secondary';
  const textColor = value === 1 ? 'text-emerald-400' : value === -1 ? 'text-red-400' : 'text-muted-foreground';
  
  return (
    <div className={cn('w-6 h-6 flex items-center justify-center font-bold text-xs rounded', bgColor, textColor)}>
      {value === 1 ? '+' : value === -1 ? '−' : '0'}
    </div>
  );
}