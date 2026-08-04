import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ensureDefaultAccount } from '@/lib/accountData';
import { checkLedgerIntegrity, formatIntegrityReport } from '@/lib/ledger';

// Developer-only ledger integrity checker (route: /admin/integrity — not linked
// in the nav). Read-only: it detects problems and prints a readable report. It
// NEVER repairs anything.
export default function IntegrityCheck() {
  const { data: accounts = [], isLoading: la } = useQuery({
    queryKey: ['tradingAccounts'], queryFn: () => ensureDefaultAccount(), staleTime: 60_000,
  });
  const { data: txns = [], isLoading: lt } = useQuery({
    queryKey: ['accountTransactions'], queryFn: () => base44.entities.AccountTransaction.list('occurred_at', 1000),
  });
  const { data: trades = [], isLoading: lc } = useQuery({
    queryKey: ['completedTradesAll'], queryFn: () => base44.entities.CompletedTrade.list('-completed_at', 1000),
  });

  const loading = la || lt || lc;
  const report = useMemo(
    () => (loading ? null : checkLedgerIntegrity({ accounts, txns, trades })),
    [loading, accounts, txns, trades]
  );

  const badge = (sev) =>
    sev === 'critical'
      ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40'
      : 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/40';

  return (
    <div className="p-4 space-y-4 pb-24 max-w-2xl mx-auto">
      <div className="pt-2">
        <h1 className="text-lg font-bold tracking-tight">Ledger integrity check</h1>
        <p className="text-xs text-muted-foreground">Developer diagnostic · read-only, never repairs.</p>
      </div>

      {loading || !report ? (
        <div className="h-24 rounded-xl bg-secondary animate-pulse" />
      ) : (
        <>
          <div className={cnStatus(report.ok)}>
            {report.ok ? 'OK — no critical issues' : 'ISSUES FOUND'}
            <span className="ml-2 text-xs font-normal opacity-80">
              critical {report.counts.critical} · warning {report.counts.warning}
            </span>
          </div>

          {report.findings.length === 0 ? (
            <div className="text-sm text-muted-foreground">No issues detected across {accounts.length} account(s), {txns.length} transaction(s), {trades.length} trade(s).</div>
          ) : (
            <div className="space-y-2">
              {report.findings.map((f, i) => (
                <div key={i} className={`rounded-lg border px-3 py-2 text-sm ${badge(f.severity)}`}>
                  <div className="font-semibold text-xs uppercase tracking-wider">{f.severity} · {f.code}</div>
                  <div className="mt-0.5">{f.message}</div>
                </div>
              ))}
            </div>
          )}

          <details className="rounded-lg border border-border bg-secondary/40 p-3">
            <summary className="text-xs font-semibold cursor-pointer">Plain-text report</summary>
            <pre className="mt-2 text-[11px] whitespace-pre-wrap font-mono text-muted-foreground">{formatIntegrityReport(report)}</pre>
          </details>
        </>
      )}
    </div>
  );
}

function cnStatus(ok) {
  return `rounded-xl border px-3 py-2 text-sm font-bold ${
    ok
      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
      : 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40'
  }`;
}
