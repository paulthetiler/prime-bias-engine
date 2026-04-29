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
      <div className="overflow-x-auto border-2 border-primary bg-background">
        <table className="w-full text-xs font-bold">
          <thead>
            <tr>
              <th className="bg-yellow-400 text-black px-2 py-2 text-left border border-black">Pair</th>
              <th className="bg-yellow-400 text-black px-2 py-2 text-center border border-black w-8">TF</th>
              <th className="bg-cyan-400 text-black px-2 py-2 text-center border border-black w-8">C</th>
              <th className="bg-cyan-400 text-black px-2 py-2 text-center border border-black w-8">M</th>
              <th className="bg-cyan-400 text-black px-2 py-2 text-center border border-black w-8">R</th>
              <th className="bg-cyan-400 text-black px-2 py-2 text-center border border-black w-8">B</th>
              <th className="bg-yellow-400 text-black px-2 py-2 text-center border border-black w-8">Σ</th>
              <th className="bg-yellow-400 text-black px-2 py-2 text-center border border-black min-w-12">Bias</th>
              <th className="bg-cyan-400 text-black px-2 py-2 text-left border border-black flex-1 min-w-48">Grade / Score / Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/30">
            {gridData.map((row, idx) => {
              const { instrument, tf, data, overall } = row;
              const isFirstRow = idx === 0 || gridData[idx - 1].instrument !== instrument;
              const isLastRow = idx === gridData.length - 1 || gridData[idx + 1].instrument !== instrument;

              if (!data) return null;

              const { indicators, total, bias } = data;
              const biasBg = bias === 'BUY' ? 'bg-emerald-500' : bias === 'SELL' ? 'bg-red-500' : 'bg-gray-400';
              const actionBg = overall.tradeAction === 'TRADE' ? 'bg-emerald-500' : overall.tradeAction === 'WAIT' ? 'bg-yellow-400' : 'bg-red-500';

              return (
                <tr key={`${instrument}-${tf.key}`} className="border-b border-black/30">
                  {/* Pair (only show once per asset) */}
                  {isFirstRow ? (
                    <td className="px-2 py-1 bg-yellow-400 text-black font-bold border-r border-black align-top" rowSpan={TIMEFRAMES.length}>
                      <div>{instrument}</div>
                    </td>
                  ) : null}

                  {/* Timeframe */}
                  <td className="px-2 py-1 bg-yellow-400 text-black text-center border-r border-black">{tf.shortLabel}</td>

                  {/* Input indicators */}
                  <td className="px-2 py-1 bg-white border-r border-black text-center">
                    <IndicatorBox value={indicators.close} />
                  </td>
                  <td className="px-2 py-1 bg-white border-r border-black text-center">
                    <IndicatorBox value={indicators.macd} />
                  </td>
                  <td className="px-2 py-1 bg-white border-r border-black text-center">
                    <IndicatorBox value={indicators.rsi} />
                  </td>
                  <td className="px-2 py-1 bg-white border-r border-black text-center">
                    <IndicatorBox value={indicators.boli} />
                  </td>

                  {/* Total */}
                  <td className="px-2 py-1 bg-yellow-400 text-black text-center border-r border-black">{total}</td>

                  {/* Bias */}
                  <td className={cn('px-2 py-1 text-center border-r border-black text-white', biasBg)}>
                    {bias || '—'}
                  </td>

                  {/* Summary (only show once per asset) */}
                  {isFirstRow && isLastRow ? (
                    <td className="px-2 py-1 bg-cyan-400 text-black align-top border-l border-black" rowSpan={TIMEFRAMES.length}>
                      <div className="space-y-0.5 font-bold">
                        <div>Grade: <span className="text-lg">{overall.grade}</span></div>
                        <div>Score: <span className="font-mono text-lg">{overall.confidenceScore}</span></div>
                        <div className={cn('px-1 py-0.5 text-center text-white', actionBg)}>
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
        <div className="bg-yellow-400 text-black border-2 border-black p-3 space-y-1 font-bold">
          <div className="text-xs uppercase tracking-widest">Activity</div>
          <div className="flex justify-between text-sm">
            <div className="text-center">
              <div className="text-lg">{summary.buys}</div>
              <div className="text-[10px]">BUY</div>
            </div>
            <div className="text-center">
              <div className="text-lg">{summary.sells}</div>
              <div className="text-[10px]">SELL</div>
            </div>
            <div className="text-center">
              <div className="text-lg">{summary.trades}</div>
              <div className="text-[10px]">TRADE</div>
            </div>
          </div>
        </div>

        <div className="bg-cyan-400 text-black border-2 border-black p-3 space-y-1 font-bold">
          <div className="text-xs uppercase tracking-widest">Stats</div>
          <div className="flex justify-between text-sm">
            <div className="text-center">
              <div className="text-lg">{summary.total}</div>
              <div className="text-[10px]">Assets</div>
            </div>
            <div className="text-center">
              <div className="text-lg">{avgGradeChar}</div>
              <div className="text-[10px]">Avg Grade</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IndicatorBox({ value }) {
  const bgColor = value === 1 ? 'bg-emerald-500' : value === -1 ? 'bg-black' : 'bg-white';
  const textColor = value === 0 ? 'text-black' : 'text-white';
  
  return (
    <div className={cn('w-6 h-6 flex items-center justify-center font-bold text-xs border border-black', bgColor, textColor)}>
      {value === 1 ? '+' : value === -1 ? '−' : ''}
    </div>
  );
}