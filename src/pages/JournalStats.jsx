import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, BarChart3 } from 'lucide-react';
import {
  computeStats, buildEquitySeries, filterByTimeframe, resolveStartingBalance,
  computeGradeBreakdown, computeAssetRanking,
} from '@/lib/journalStats';
import PerformanceSummary from '@/components/journal/PerformanceSummary';
import GradeAssetBreakdown from '@/components/journal/GradeAssetBreakdown';

export default function JournalStats() {
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState('all');

  // Completed trades carry the P&L; monthly journals give a real starting
  // balance for the ROI / account-balance views. Both share their cache keys
  // with the rest of the app so navigating here is instant when warm.
  const { data: trades = [], isLoading } = useQuery({
    queryKey: ['completedTrades'],
    queryFn: () => base44.entities.CompletedTrade.filter({ status: 'completed' }, '-completed_at', 200),
  });
  const { data: monthly = [] } = useQuery({
    queryKey: ['journal'],
    queryFn: () => base44.entities.MonthlyJournal.list('-year', 200),
  });

  const { value: startingBalance, source: balanceSource } = useMemo(
    () => resolveStartingBalance(monthly),
    [monthly]
  );

  const windowTrades = useMemo(() => filterByTimeframe(trades, timeframe), [trades, timeframe]);
  const stats = useMemo(() => computeStats(windowTrades, { startingBalance }), [windowTrades, startingBalance]);
  const series = useMemo(() => buildEquitySeries(windowTrades, { startingBalance }), [windowTrades, startingBalance]);
  const grades = useMemo(() => computeGradeBreakdown(windowTrades), [windowTrades]);
  const assets = useMemo(() => computeAssetRanking(windowTrades), [windowTrades]);

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={() => navigate('/journal')}
          className="-ml-1.5 p-1.5 rounded-lg hover:bg-secondary transition-colors"
          aria-label="Back to Journal"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold tracking-tight">Performance</h1>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[...Array(8)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-secondary animate-pulse" />)}
          </div>
          <div className="h-48 rounded-2xl bg-secondary animate-pulse" />
        </div>
      ) : trades.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground text-sm">
          <BarChart3 className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>No completed trades yet.</p>
          <p className="text-xs mt-1">Complete a trade to start tracking your performance.</p>
        </div>
      ) : (
        <>
          <PerformanceSummary
            stats={stats}
            series={series}
            timeframe={timeframe}
            onTimeframe={setTimeframe}
            startingBalance={startingBalance}
            balanceSource={balanceSource}
          />
          <GradeAssetBreakdown grades={grades} assets={assets} />
        </>
      )}
    </div>
  );
}
