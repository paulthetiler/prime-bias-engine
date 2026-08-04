import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, BarChart3, ShieldAlert } from 'lucide-react';
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
import { normalizeTrade } from '@/lib/tradeCompat';
import {
  computePerformance, engineVersionsInScope, filterByEngineVersion,
  breakdown, breakdownByReasonTags, reconcile, tradeSummary,
  tradingDrawdown, tradingEquityCurve, resolveFilterValue, KEYERS,
} from '@/lib/performance';
import PerformanceSummary from '@/components/journal/PerformanceSummary';
import GradeAssetBreakdown from '@/components/journal/GradeAssetBreakdown';
import BreakdownGroup from '@/components/journal/BreakdownGroup';
import TradingEquityCurve from '@/components/journal/TradingEquityCurve';
import EquityCurve from '@/components/journal/EquityCurve';

const LEGACY = 'legacy-pre-snapshot';
const engineVersionLabel = (v) => (v === LEGACY ? 'Legacy — pre-snapshot' : v);
const fmtMoney = (n, cur) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}${cur ? cur + ' ' : ''}${s}`;
};

export default function JournalStats() {
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState('all');
  const [account, setAccount] = useState('all');       // 'all' | accountId
  const [engineVersion, setEngineVersion] = useState('all'); // 'all' | version
  const [instrument, setInstrument] = useState('all');       // 'all' | symbol

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

  const trades = useMemo(() => rawTrades.map(t => normalizeTrade(withDerivedFinancials(t))), [rawTrades]);
  const active = useMemo(() => activeAccounts(accounts), [accounts]);
  const soleAccountId = active.length === 1 ? active[0].id : null;

  const scope = useMemo(() => {
    if (account === 'all') {
      const currencies = [...new Set(active.map(a => a.currency || 'USD'))];
      return { accts: active, currency: currencies.length === 1 ? currencies[0] : null, mixed: currencies.length > 1 };
    }
    const a = active.find(x => x.id === account);
    return { accts: a ? [a] : [], currency: a?.currency ?? null, mixed: false };
  }, [account, active]);

  const monetaryEnabled = !scope.mixed;
  const combinedAccount = useMemo(() => ({
    id: account === 'all' ? 'all' : account,
    name: 'scope',
    currency: scope.currency || 'USD',
    starting_balance: scope.accts.reduce((s, a) => s + (Number(a.starting_balance) || 0), 0),
  }), [scope, account]);
  const scopeAcctIds = useMemo(() => new Set(scope.accts.map(a => a.id)), [scope]);

  // Account + date scope — the true account view (used for balance / ROI / cashflow
  // / reconciliation). Analysis filters (engine version, instrument) are NOT applied
  // here because cash movement is not "per engine version".
  const accountTrades = useMemo(
    () => trades.filter(t => tradeInAccount(t, account === 'all' ? null : account, soleAccountId)),
    [trades, account, soleAccountId]
  );
  const accountTxns = useMemo(
    () => txns.filter(tx => account === 'all' || scopeAcctIds.has(tx.account_id)),
    [txns, account, scopeAcctIds]
  );
  const windowStartMs = useMemo(() => windowStart(timeframe), [timeframe]);
  const windowTrades = useMemo(() => filterByTimeframe(accountTrades, timeframe), [accountTrades, timeframe]);
  const windowTxns = useMemo(
    () => (windowStartMs == null ? accountTxns : accountTxns.filter(tx => new Date(tx.occurred_at).getTime() >= windowStartMs)),
    [accountTxns, windowStartMs]
  );

  // Filter options come from the account+date window (before analysis filters).
  const versionsInScope = useMemo(() => engineVersionsInScope(windowTrades), [windowTrades]);
  const instrumentsInScope = useMemo(
    () => [...new Set(windowTrades.map(t => t.instrument).filter(Boolean))].sort(),
    [windowTrades]
  );

  // Never keep an invisible filter: when the account/date scope changes and the
  // selected engine version / instrument no longer exists, reset it to 'all'. A
  // still-valid selection is left untouched (functional setState bails out).
  useEffect(() => { setEngineVersion(v => resolveFilterValue(v, versionsInScope)); }, [versionsInScope]);
  useEffect(() => { setInstrument(v => resolveFilterValue(v, instrumentsInScope)); }, [instrumentsInScope]);

  // Analysis scope — the trade-quality set the Overview + all breakdowns use.
  const analysisTrades = useMemo(() => {
    let list = windowTrades;
    if (engineVersion !== 'all') list = filterByEngineVersion(list, engineVersion);
    if (instrument !== 'all') list = list.filter(t => t.instrument === instrument);
    return list;
  }, [windowTrades, engineVersion, instrument]);

  // Overview + engine/behaviour breakdowns reflect the analysis filters.
  const stats = useMemo(() => computeStats(analysisTrades), [analysisTrades]);
  const grades = useMemo(() => computeGradeBreakdown(analysisTrades), [analysisTrades]);
  const assets = useMemo(() => computeAssetRanking(analysisTrades), [analysisTrades]);

  // Account-state figures (account + date only).
  const roi = useMemo(() => (monetaryEnabled ? periodRoi(combinedAccount, accountTxns, accountTrades, windowStartMs) : null),
    [monetaryEnabled, combinedAccount, accountTxns, accountTrades, windowStartMs]);
  const openingBalance = useMemo(() => (monetaryEnabled ? balanceBefore(combinedAccount, accountTxns, accountTrades, windowStartMs) : 0),
    [monetaryEnabled, combinedAccount, accountTxns, accountTrades, windowStartMs]);
  const series = useMemo(() => (monetaryEnabled ? buildEquitySeries(windowTrades, windowTxns, { openingBalance }) : []),
    [monetaryEnabled, windowTrades, windowTxns, openingBalance]);
  const currentBalance = useMemo(() => (monetaryEnabled ? accountBalance(combinedAccount, accountTxns, accountTrades) : null),
    [monetaryEnabled, combinedAccount, accountTxns, accountTrades]);
  const perf = useMemo(
    () => (monetaryEnabled ? computePerformance({ account: combinedAccount, txns: accountTxns, trades: accountTrades, windowStartMs }) : null),
    [monetaryEnabled, combinedAccount, accountTxns, accountTrades, windowStartMs]
  );
  const recon = useMemo(
    () => (monetaryEnabled ? reconcile({ account: combinedAccount, txns: accountTxns, trades: accountTrades, windowStartMs }) : null),
    [monetaryEnabled, combinedAccount, accountTxns, accountTrades, windowStartMs]
  );

  // Overview trade-quality tiles reflect the analysis scope; wages come from the
  // account cashflow (period), and trading drawdown from the analysis trades.
  const overview = useMemo(() => {
    if (!monetaryEnabled) return null;
    const dd = tradingDrawdown(analysisTrades, openingBalance);
    return { ...tradeSummary(analysisTrades), tradingDrawdown: dd.maxDrawdown, tradingDrawdownPct: dd.maxDrawdownPct, wages: perf?.wages ?? 0 };
  }, [monetaryEnabled, analysisTrades, openingBalance, perf]);
  const tradingCurve = useMemo(
    () => (monetaryEnabled ? tradingEquityCurve(analysisTrades, openingBalance) : []),
    [monetaryEnabled, analysisTrades, openingBalance]
  );

  const versionScopeCombines = engineVersion === 'all' && versionsInScope.length > 1;
  const crossAssetPips = instrument === 'all' && instrumentsInScope.length > 1;

  // Breakdown row-sets (all consume performance.breakdown — no maths here).
  const engineBreakdowns = useMemo(() => ({
    grade: breakdown(analysisTrades, KEYERS.effectiveGrade),
    rawGrade: breakdown(analysisTrades, KEYERS.rawGrade),
    scoreBand: breakdown(analysisTrades, KEYERS.scoreBand),
    version: breakdown(analysisTrades, KEYERS.engineVersion, { labelFn: engineVersionLabel }),
    deep: breakdown(analysisTrades, KEYERS.deepStrength),
    dd: breakdown(analysisTrades, KEYERS.ddStrength),
    now: breakdown(analysisTrades, KEYERS.nowStrength),
    alignment: breakdown(analysisTrades, KEYERS.alignment),
    engineDir: breakdown(analysisTrades, KEYERS.engineDirection),
    withAgainst: breakdown(analysisTrades, KEYERS.withAgainstEngine),
  }), [analysisTrades]);
  const behaviourBreakdowns = useMemo(() => ({
    executed: breakdown(analysisTrades, KEYERS.executedDirection),
    asset: breakdown(analysisTrades, KEYERS.asset),
    mood: breakdown(analysisTrades, KEYERS.mood),
    tags: breakdownByReasonTags(analysisTrades),
    hour: breakdown(analysisTrades, KEYERS.hourOfDay),
    day: breakdown(analysisTrades, KEYERS.dayOfWeek),
    month: breakdown(analysisTrades, KEYERS.month),
  }), [analysisTrades]);

  const bgProps = { currency: scope.currency, monetaryEnabled };

  return (
    <div className="p-4 space-y-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 pt-2">
        <button onClick={() => navigate('/journal')} className="-ml-1.5 p-1.5 rounded-lg hover:bg-secondary transition-colors" aria-label="Back to Journal">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold tracking-tight">Performance</h1>
      </div>

      {/* Filters */}
      {active.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <AccountChip label="All accounts" active={account === 'all'} onClick={() => setAccount('all')} />
          {active.map(a => (
            <AccountChip key={a.id} label={`${a.name} · ${a.currency}`} active={account === a.id} onClick={() => setAccount(a.id)} />
          ))}
        </div>
      )}
      {!isLoading && trades.length > 0 && (versionsInScope.length > 1 || instrumentsInScope.length > 1) && (
        <div className="flex flex-wrap gap-2">
          {versionsInScope.length > 1 && (
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              Engine
              <select value={engineVersion} onChange={e => setEngineVersion(e.target.value)}
                className="h-8 rounded-lg border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="all">All versions</option>
                {versionsInScope.map(v => <option key={v} value={v}>{engineVersionLabel(v)}</option>)}
              </select>
            </label>
          )}
          {instrumentsInScope.length > 1 && (
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              Instrument
              <select value={instrument} onChange={e => setInstrument(e.target.value)}
                className="h-8 rounded-lg border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="all">All instruments</option>
                {instrumentsInScope.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">{[...Array(8)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-secondary animate-pulse" />)}</div>
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
            <Banner>Your accounts use different currencies, so monetary totals aren’t combined. Pick a single account to see Net P/L, ROI and balance. Non-money stats (win rate, counts) still apply.</Banner>
          )}
          {versionScopeCombines && (
            <Banner>This view combines {versionsInScope.length} engine versions ({versionsInScope.map(engineVersionLabel).join(', ')}). Grade/score comparisons mix different engine logic — pick one version above for valid engine analysis.</Banner>
          )}

          {/* ── Overview (trade analysis) ── */}
          <SectionTitle sub="Trade analysis: selected account, period, engine version and instrument.">Overview</SectionTitle>
          <PerformanceSummary
            stats={stats} perf={overview}
            timeframe={timeframe} onTimeframe={setTimeframe}
            currency={scope.currency} monetaryEnabled={monetaryEnabled}
          />
          {monetaryEnabled && <TradingEquityCurve values={tradingCurve} currency={scope.currency} />}
          <GradeAssetBreakdown grades={grades} assets={assets} />

          {/* ── Engine performance ── */}
          <SectionTitle sub="How the engine's own signals actually performed. Small samples are muted; sort with the control on each card.">Engine performance</SectionTitle>
          <div className="space-y-2.5">
            <BreakdownGroup title="Effective grade" rows={engineBreakdowns.grade} {...bgProps} />
            <BreakdownGroup title="Raw grade (pre-cap)" rows={engineBreakdowns.rawGrade} {...bgProps} />
            <BreakdownGroup title="Score band" subtitle="Bands on the saved score, not the grade." rows={engineBreakdowns.scoreBand} {...bgProps} />
            <BreakdownGroup title="Engine version" rows={engineBreakdowns.version} {...bgProps} />
            <BreakdownGroup title="Deep strength" rows={engineBreakdowns.deep} {...bgProps} />
            <BreakdownGroup title="DD strength" rows={engineBreakdowns.dd} {...bgProps} />
            <BreakdownGroup title="Now strength" rows={engineBreakdowns.now} {...bgProps} />
            <BreakdownGroup title="Alignment" rows={engineBreakdowns.alignment} {...bgProps} />
            <BreakdownGroup title="Engine direction" rows={engineBreakdowns.engineDir} {...bgProps} />
            <BreakdownGroup title="Traded with / against engine" rows={engineBreakdowns.withAgainst} {...bgProps} />
          </div>

          {/* ── Trade behaviour ── */}
          <SectionTitle sub={crossAssetPips ? 'Note: pips/points totals combine multiple instruments and are informational only — point values are not directly comparable. Filter by instrument for a valid total.' : undefined}>Trade behaviour</SectionTitle>
          <div className="space-y-2.5">
            <BreakdownGroup title="Executed direction" rows={behaviourBreakdowns.executed} {...bgProps} />
            <BreakdownGroup title="Instrument" rows={behaviourBreakdowns.asset} {...bgProps} />
            <BreakdownGroup title="Mood" rows={behaviourBreakdowns.mood} {...bgProps} />
            <BreakdownGroup title="Reason tags" rows={behaviourBreakdowns.tags} {...bgProps} />
            <BreakdownGroup title="Hour of day" rows={behaviourBreakdowns.hour} {...bgProps} />
            <BreakdownGroup title="Day of week" rows={behaviourBreakdowns.day} {...bgProps} />
            <BreakdownGroup title="Month" rows={behaviourBreakdowns.month} {...bgProps} />
          </div>

          {/* ── Account & cashflow (account ledger) ── */}
          <SectionTitle sub="Account ledger: selected account and period only. Engine-version and instrument filters do not apply here — cash movement is not per-engine. External cash (deposits/withdrawals/wages) is kept separate from trading P&L.">Account &amp; cashflow</SectionTitle>
          {monetaryEnabled && perf ? (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-1.5 text-sm">
              <CashRow label="Opening balance" value={fmtMoney(perf.openingBalance, scope.currency)} />
              <CashRow label="Trading net P&L" value={fmtMoney(perf.netPnl, scope.currency)} tone={perf.netPnl > 0 ? 'up' : perf.netPnl < 0 ? 'down' : ''} />
              <CashRow label="ROI (period)" value={roi?.roiPct == null ? '—' : `${roi.roiPct >= 0 ? '+' : '−'}${Math.abs(roi.roiPct).toFixed(1)}%`} tone={roi?.roiPct == null ? '' : roi.roiPct >= 0 ? 'up' : 'down'} />
              <CashRow label="Deposits" value={fmtMoney(perf.deposits, scope.currency)} />
              <CashRow label="Withdrawals" value={fmtMoney(perf.withdrawals ? -perf.withdrawals : 0, scope.currency)} />
              <CashRow label="Wage withdrawals" value={fmtMoney(perf.wages ? -perf.wages : 0, scope.currency)} />
              <CashRow label="Adjustments" value={fmtMoney(perf.adjustments, scope.currency)} />
              <div className="border-t border-border my-1" />
              <CashRow label="Current balance" value={fmtMoney(currentBalance, scope.currency)} strong />
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
              Money totals are unavailable for a mixed-currency scope. Pick a single account to see the ledger.
            </div>
          )}
          {monetaryEnabled && (
            <EquityCurve series={series} hasPnl={stats.hasPnl} currentBalance={currentBalance} currency={scope.currency} />
          )}

          {/* Reconciliation */}
          {monetaryEnabled && recon && (
            <div className={cn('rounded-2xl border p-4 shadow-sm text-sm',
              recon.reconciled ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5')}>
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className={cn('w-4 h-4', recon.reconciled ? 'text-emerald-500' : 'text-red-500')} />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Reconciliation · {recon.reconciled ? 'balanced' : 'discrepancy'}
                </span>
              </div>
              <CashRow label="Expected closing" value={fmtMoney(recon.expectedClosing, scope.currency)} />
              <CashRow label="Rebuilt closing" value={fmtMoney(recon.actualClosing, scope.currency)} />
              <CashRow label="Difference" value={fmtMoney(recon.difference, scope.currency)} tone={recon.reconciled ? '' : 'down'} strong />
              {!recon.reconciled && (
                <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">
                  Ledger does not reconcile. An admin can investigate at <code className="font-mono">/admin/integrity</code>. No automatic repair is performed.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SectionTitle({ children, sub = null }) {
  return (
    <div className="pt-2">
      <h2 className="text-sm font-bold tracking-tight">{children}</h2>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function Banner({ children }) {
  return (
    <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-300">
      {children}
    </div>
  );
}

function CashRow({ label, value, tone = '', strong = false }) {
  const toneClass = tone === 'up' ? 'text-emerald-500' : tone === 'down' ? 'text-red-500' : 'text-foreground';
  return (
    <div className="flex items-center justify-between">
      <span className={cn('text-muted-foreground', strong && 'font-semibold text-foreground')}>{label}</span>
      <span className={cn('font-mono', strong ? 'font-bold' : 'font-semibold', toneClass)}>{value}</span>
    </div>
  );
}

function AccountChip({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={cn('shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95',
        active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-card text-muted-foreground hover:border-primary/40')}>
      {label}
    </button>
  );
}
