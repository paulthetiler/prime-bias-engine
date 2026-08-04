import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { checkLedgerIntegrity, formatIntegrityReport } from '@/lib/ledger';
import { breakdown, KEYERS } from '@/lib/performance';
import { CURRENT_ENGINE_VERSION, LEGACY_ENGINE_VERSION } from '@/lib/engineConfig';
import PageNotFound from '@/lib/PageNotFound';

const engineVersionLabel = (v) => (v === LEGACY_ENGINE_VERSION ? 'Legacy — pre-snapshot' : v);

// Admin-only ledger integrity checker (route: /admin/integrity). Access is gated
// by the SAME authoritative admin check used elsewhere (base44.auth.me().role,
// i.e. Supabase user_metadata.role === 'admin'; see PageNotFound). Non-admins get
// the existing not-found behaviour and — crucially — the protected account,
// transaction and trade queries never run for them (they are `enabled` only once
// admin access is resolved). Read-only: it never repairs anything.
export default function IntegrityCheck() {
  // Resolve access FIRST. Protected queries stay disabled until this settles.
  const { data: authData, isLoading: authLoading } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        return { user: await base44.auth.me(), isAuthenticated: true };
      } catch {
        return { user: null, isAuthenticated: false };
      }
    },
  });
  const isAdmin = Boolean(authData?.isAuthenticated && authData.user?.role === 'admin');

  // These only fetch once admin access is confirmed (`enabled: isAdmin`), so a
  // non-admin — or the pre-auth loading state — never triggers them.
  const { data: accounts = [] } = useQuery({
    queryKey: ['integrityAccounts'],
    queryFn: () => base44.entities.TradingAccount.list('created_at', 500),
    enabled: isAdmin,
  });
  const { data: txns = [] } = useQuery({
    queryKey: ['integrityTransactions'],
    queryFn: () => base44.entities.AccountTransaction.list('occurred_at', 1000),
    enabled: isAdmin,
  });
  const { data: trades = [] } = useQuery({
    queryKey: ['integrityTrades'],
    queryFn: () => base44.entities.CompletedTrade.list('-completed_at', 1000),
    enabled: isAdmin,
  });

  const report = useMemo(
    () => (isAdmin ? checkLedgerIntegrity({ accounts, txns, trades }) : null),
    [isAdmin, accounts, txns, trades]
  );

  // Engine-version diagnostics are ADMIN/DEVELOPER-ONLY: normal users never see a
  // version breakdown (the Performance page always uses the current engine). This
  // exposes how many stored records fall under each ruleset so a developer can
  // confirm obsolete records are being excluded from current-engine stats.
  const engineRows = useMemo(
    () => (isAdmin ? breakdown(trades, KEYERS.engineVersion, { labelFn: engineVersionLabel }) : []),
    [isAdmin, trades]
  );
  const nonCurrentCount = useMemo(
    () => engineRows.filter(r => r.key !== CURRENT_ENGINE_VERSION).reduce((n, r) => n + r.totalTrades, 0),
    [engineRows]
  );

  // Access unresolved → show nothing sensitive, run nothing protected.
  if (authLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  // Non-admin → existing not-authorised/not-found behaviour, no report, no IDs.
  if (!isAdmin) return <PageNotFound />;

  const badge = (sev) =>
    sev === 'critical'
      ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40'
      : 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/40';

  return (
    <div className="p-4 space-y-4 pb-24 max-w-2xl mx-auto">
      <div className="pt-2">
        <h1 className="text-lg font-bold tracking-tight">Ledger integrity check</h1>
        <p className="text-xs text-muted-foreground">Admin diagnostic · read-only, never repairs.</p>
      </div>

      <div className={cnStatus(report.ok)}>
        {report.ok ? 'OK — no critical issues' : 'ISSUES FOUND'}
        <span className="ml-2 text-xs font-normal opacity-80">
          critical {report.counts.critical} · warning {report.counts.warning}
        </span>
      </div>

      {report.findings.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No issues detected across {accounts.length} account(s), {txns.length} transaction(s), {trades.length} trade(s).
        </div>
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

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div>
          <h2 className="text-sm font-semibold">Engine-version breakdown</h2>
          <p className="text-[11px] text-muted-foreground">
            Developer diagnostic. Current engine: <code className="font-mono">{CURRENT_ENGINE_VERSION}</code>.
            {' '}Records under any other version are excluded from normal performance stats
            ({nonCurrentCount} such record{nonCurrentCount === 1 ? '' : 's'}), but are kept in history.
          </p>
        </div>
        {engineRows.length === 0 ? (
          <div className="text-xs text-muted-foreground">No completed trades.</div>
        ) : (
          <div className="space-y-1">
            {engineRows.map(r => {
              const current = r.key === CURRENT_ENGINE_VERSION;
              return (
                <div key={r.key} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`font-mono text-xs ${current ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>{r.label}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border ${
                      current
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-border bg-secondary/60 text-muted-foreground'
                    }`}>
                      {current ? 'current' : 'excluded'}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{r.totalTrades} trade{r.totalTrades === 1 ? '' : 's'}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <details className="rounded-lg border border-border bg-secondary/40 p-3">
        <summary className="text-xs font-semibold cursor-pointer">Plain-text report</summary>
        <pre className="mt-2 text-[11px] whitespace-pre-wrap font-mono text-muted-foreground">{formatIntegrityReport(report)}</pre>
      </details>
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
