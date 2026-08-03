import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  computeStats, filterByTimeframe, windowStart,
  computeGradeBreakdown, computeAssetRanking,
} from '@/lib/journalStats';
import {
  withDerivedFinancials, tradeInAccount, activeAccounts,
  periodRoi, buildEquitySeries, accountBalance, balanceBefore,
} from '@/lib/accounts';
import { ensureDefaultAccount } from '@/lib/accountData';
import PerformanceSummary from '@/components/journal/PerformanceSummary';
import GradeAssetBreakdown from '@/components/journal/GradeAssetBreakdown';

export default function JournalStats() {
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState('all');
  const [account, setAccount] = useState('all'); // 'all' | accountId

  const { data: rawTrades = [], isLoading } = useQuery({
    queryKey: ['completedTrades'],
    queryFn: () => base44.entities.CompletedTrade.filter({ status: 'completed' }, '-completed_at', 200),
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ['tradingAccounts'],
    queryFn: () => ensureDefaultAccount(),
    staleTime: 60_000,
  });
  const { data: txns = [] } = useQuery({
    queryKey: ['accountTransactions'],
    queryFn: () => base44.entities.AccountTransaction.list('occurred_at', 500),
  });

  // Read-time shim: legacy detailed-mode trades stored their result in `pnl`.
  const trades = useMemo(() => rawTrades.map(withDerivedFinancials), [rawTrades]);
  const active = useMemo(() => activeAccounts(accounts), [accounts]);
  const soleAccountId = active.length === 1 ? active[0].id : null;

  // Which accounts are in scope, and can we show one coherent monetary total?
  const scope = useMemo(() => {
    if (account === 'all') {
      const currencies = [...new Set(active.map(a => a.currency || 'USD'))];
      return { accts: active, currency: currencies.length === 1 ? currencies[0] : null, mixed: currencies.length > 1 };
    }
    const a = active.find(x => x.id === account);
    return { accts: a ? [a] : [], currency: a?.currency ?? null, mixed: false };
  }, [account, active]);

  const monetaryEnabled = !scope.mixed;
  const combinedAccount = useMemo(
    () => ({
      id: account === 'all' ? 'all' : account,
      name: 'scope',
      currency: scope.currency || 'USD',
      starting_balance: scope.accts.reduce((s, a) => s + (Number(a.starting_balance) || 0), 0),
    }),
    [scope, account]
  );
  const scopeAcctIds = useMemo(() => new Set(scope.accts.map(a => a.id)), [scope]);

  // Filter trades + transactions to the selected account.
  const accountTrades = useMemo(
    () => trades.filter(t => tradeInAccount(t, account === 'all' ? null : account, soleAccountId)),
    [trades, account, soleAccountId]
  );
  const accountTxns = useMemo(
    () => txns.filter(tx => account === 'all' || scopeAcctIds.has(tx.account_id)),
    [txns, account, scopeAcctIds]
  );

  // Apply the date window.
  const windowStartMs = useMemo(() => windowStart(timeframe), [timeframe]);
  const windowTrades = useMemo(() => filterByTimeframe(accountTrades, timeframe), [accountTrades, timeframe]);
  const windowTxns = useMemo(
    () => (windowStartMs == null ? accountTxns : accountTxns.filter(tx => new Date(tx.occurred_at).getTime() >= windowStartMs)),
    [accountTxns, windowStartMs]
  );

  const stats = useMemo(() => computeStats(windowTrades), [windowTrades]);

  const roi = useMemo(
    () => (monetaryEnabled ? periodRoi(combinedAccount, accountTxns, accountTrades, windowStartMs) : null),
    [monetaryEnabled, combinedAccount, accountTxns, accountTrades, windowStartMs]
  );
  const openingBalance = useMemo(
    () => (monetaryEnabled ? balanceBefore(combinedAccount, accountTxns, accountTrades, windowStartMs) : 0),
    [monetaryEnabled, combinedAccount, accountTxns, accountTrades, windowStartMs]
  );
  const series = useMemo(
    () => (monetaryEnabled ? buildEquitySeries(windowTrades, windowTxns, { openingBalance }) : []),
    [monetaryEnabled, windowTrades, windowTxns, openingBalance]
  );
  const currentBalance = useMemo(
    () => (monetaryEnabled ? accountBalance(combinedAccount, accountTxns, accountTrades) : null),
    [monetaryEnabled, combinedAccount, accountTxns, accountTrades]
  );

  const grades = useMemo(() => computeGradeBreakdown(windowTrades), [windowTrades]);
  const assets = useMemo(() => computeAssetRanking(windowTrades), [windowTrades]);

  return (
    <div className="p-4 space-y-4 pb-24">
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

      {/* Account filter — only meaningful with more than one account. */}
      {active.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <AccountChip label="All accounts" active={account === 'all'} onClick={() => setAccount('all')} />
          {active.map(a => (
            <AccountChip key={a.id} label={`${a.name} · ${a.currency}`} active={account === a.id} onClick={() => setAccount(a.id)} />
          ))}
        </div>
      )}

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
          {scope.mixed && (
            <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-300">
              Your accounts use different currencies, so monetary totals aren’t combined. Pick a single account to see Net P/L, ROI and balance.
            </div>
          )}
          <PerformanceSummary
            stats={stats}
            series={series}
            timeframe={timeframe}
            onTimeframe={setTimeframe}
            roiPct={roi?.roiPct ?? null}
            openingBalance={openingBalance}
            currentBalance={currentBalance}
            currency={scope.currency}
            monetaryEnabled={monetaryEnabled}
          />
          <GradeAssetBreakdown grades={grades} assets={assets} />
        </>
      )}
    </div>
  );
}

function AccountChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95',
        active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-card text-muted-foreground hover:border-primary/40'
      )}
    >
      {label}
    </button>
  );
}
