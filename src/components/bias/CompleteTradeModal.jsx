import React, { useState, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getSettings } from '@/lib/userSettings';
import { base44 } from '@/api/base44Client';
import { completeTrade, computeTradeFinancials } from '@/lib/tradeCompletion';
import { ensureDefaultAccount } from '@/lib/accountData';
import {
  activeAccounts, withDerivedFinancials, tradeInAccount, accountBalance,
} from '@/lib/accounts';
import {
  projectedBalance, riskPct, realisedR, estimatedPoints,
  reconcileResult, MOODS,
} from '@/lib/tradeFinancials';
import { celebrateWin } from '@/lib/celebrate';
import { tap } from '@/lib/haptics';

const RESULTS = [
  { value: 'win',       label: 'WIN',        emoji: '✅', color: 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  { value: 'loss',      label: 'LOSS',       emoji: '❌', color: 'border-red-500 bg-red-500/15 text-red-600 dark:text-red-400' },
  { value: 'breakeven', label: 'BREAK EVEN', emoji: '➖', color: 'border-yellow-500 bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' },
  { value: 'not_taken', label: 'NOT TAKEN',  emoji: '🚫', color: 'border-muted-foreground/50 bg-secondary text-muted-foreground' },
];

const fmtMoney = (n, cur) => `${n < 0 ? '−' : ''}${cur ? cur + ' ' : ''}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

// Resolve accounts (creating a default if none) and the money/ledger context for
// the selected account, so the modal can preview balance-before / after.
function useCaptureContext() {
  const { data: accounts = [] } = useQuery({
    queryKey: ['tradingAccounts'],
    queryFn: () => ensureDefaultAccount(),
    staleTime: 60_000,
  });
  const { data: rawTrades = [] } = useQuery({
    queryKey: ['completedTrades'],
    queryFn: () => base44.entities.CompletedTrade.filter({ status: 'completed' }, '-completed_at', 200),
  });
  const { data: txns = [] } = useQuery({
    queryKey: ['accountTransactions'],
    queryFn: () => base44.entities.AccountTransaction.list('occurred_at', 500),
  });
  const active = useMemo(() => activeAccounts(accounts), [accounts]);
  const [accountId, setAccountId] = useState('');
  const resolvedAccountId = accountId || active[0]?.id || '';
  const account = active.find(a => a.id === resolvedAccountId) || null;
  const soleAccountId = active.length === 1 ? active[0].id : null;

  // Balance BEFORE this (not-yet-saved) trade = the account's current balance.
  const balanceBefore = useMemo(() => {
    if (!account) return null;
    const trades = rawTrades.map(withDerivedFinancials).filter(t => tradeInAccount(t, account.id, soleAccountId));
    const accTxns = txns.filter(tx => tx.account_id === account.id);
    return accountBalance(account, accTxns, trades);
  }, [account, rawTrades, txns, soleAccountId]);

  return { active, account, accountId: resolvedAccountId, setAccountId, currency: account?.currency || '', balanceBefore };
}

function Field({ label, hint = null, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-foreground block mb-1">
        {label}{hint && <span className="text-muted-foreground font-normal"> {hint}</span>}
      </label>
      {children}
    </div>
  );
}

const numCls = 'w-full h-11 rounded-lg border border-input bg-background px-3 text-base font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';
const smallNumCls = 'w-full h-9 rounded-lg border border-input bg-background px-3 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';

function ResultPicker({ result, onPick, saving }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {RESULTS.map(r => (
        <button
          key={r.value}
          disabled={saving}
          onClick={() => { tap(); onPick(r.value); }}
          className={cn(
            'rounded-xl border-2 py-3 text-sm font-bold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
            result === r.value ? r.color : 'border-border bg-secondary text-foreground hover:border-primary/50 hover:bg-primary/5'
          )}
        >
          <div className="text-xl mb-0.5">{r.emoji}</div>
          <div>{r.label}</div>
        </button>
      ))}
    </div>
  );
}

function ModalShell({ instrument, results, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl overflow-y-auto"
        style={{ marginBottom: 'calc(64px + var(--safe-area-bottom))', maxHeight: 'calc(100vh - 120px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <div className="text-base font-bold">Complete Trade</div>
            <div className="text-xs text-muted-foreground font-mono">{instrument}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X className="w-4 h-4" /></button>
        </div>
        {results && (
          <div className="px-4 pt-3">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className={cn('font-bold', results?.mainDirection === 'BUY' ? 'text-primary' : 'text-destructive')}>
                Engine: {results?.mainDirection}
              </span>
              <span>Grade <span className="text-foreground font-semibold">{results?.grade}</span></span>
              <span>Score <span className="text-foreground font-mono font-semibold">{results?.winningScore}</span></span>
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export default function CompleteTradeModal({ analysis, onClose, onCompleted }) {
  const settings = getSettings();
  const { active, account, accountId, setAccountId, currency, balanceBefore } = useCaptureContext();

  const [result, setResult] = useState('');
  const [grossPnl, setGrossPnl] = useState('');
  const [fees, setFees] = useState('');
  const [risk, setRisk] = useState('');
  const [tradeDir, setTradeDir] = useState(''); // 'long' | 'short'
  const [positionSize, setPositionSize] = useState('');
  const [pointsPips, setPointsPips] = useState('');
  const [splitCount, setSplitCount] = useState('1');
  const [mood, setMood] = useState('');
  const [notes, setNotes] = useState('');
  const [brokerEvidence, setBrokerEvidence] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [showDetail, setShowDetail] = useState(settings.tradeCompletionMode === 'detailed');
  const [showEvidence, setShowEvidence] = useState(false);
  const [saving, setSaving] = useState(false);
  const processingRef = useRef(false);

  const engineBias = analysis?.results?.mainDirection; // 'BUY' | 'SELL'
  // Default the executed direction to the engine bias (user can override truthfully).
  const effectiveDir = tradeDir || (engineBias === 'BUY' ? 'long' : engineBias === 'SELL' ? 'short' : '');

  // Derive net via the same combiner the write path uses, so the preview and the
  // reconciled result exactly match what will be stored (incl. scratch + fees → loss).
  const netPnl = result === 'not_taken' ? null : computeTradeFinancials({ result, grossPnl, fees }).netPnl;
  const reconciled = reconcileResult(result, netPnl);
  const resultConflict = netPnl != null && reconciled.changed;
  const projected = balanceBefore != null ? projectedBalance(balanceBefore, netPnl) : null;
  const rMult = realisedR(netPnl, risk);
  const rPct = balanceBefore != null ? riskPct(risk, balanceBefore) : null;
  const estPts = estimatedPoints(netPnl, positionSize);

  if (!analysis) return null;
  const { instrument, results } = analysis;
  const showMoney = result && result !== 'not_taken';

  const save = async (chosen = result) => {
    if (!chosen) { toast.error('Select a result'); return; }
    if (processingRef.current) return;
    processingRef.current = true;
    setSaving(true);
    let record;
    try {
      record = await completeTrade(analysis, chosen, {
        grossPnl: chosen === 'not_taken' ? undefined : grossPnl,
        fees, amountRisked: risk, accountId,
        tradeDirection: chosen === 'not_taken' ? undefined : effectiveDir,
        positionSize, pointsPips, splitCount, mood, notes,
        brokerEvidence, screenshotUrl,
      });
    } catch {
      setSaving(false);
      processingRef.current = false;
      toast.error('Failed to save trade. Please try again.');
      return;
    }
    const finalResult = record?.result || chosen;
    const label = RESULTS.find(r => r.value === finalResult)?.label || finalResult;
    if (resultConflict) toast.success(`Saved as ${label} to match net P&L`);
    else toast.success(`${instrument} saved as ${label}`);
    if (finalResult === 'win') celebrateWin();
    setSaving(false);
    onClose();
    onCompleted?.(record);
  };

  const onPick = (value) => {
    setResult(value);
    if (value === 'not_taken') save('not_taken'); // no money to capture
  };

  return (
    <ModalShell instrument={instrument} results={results} onClose={onClose}>
      <div className="px-4 pb-5 pt-3 space-y-3">
        {saving ? (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-5 h-5 animate-spin" /> Saving…
          </div>
        ) : (
          <>
            <ResultPicker result={result} onPick={onPick} saving={saving} />

            {showMoney && (
              <>
                {/* Money: gross / fees / net */}
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`Gross P&L${currency ? ` (${currency})` : ''}`} hint="loss = negative">
                    <input type="number" inputMode="decimal" step="any" value={grossPnl}
                      onChange={e => setGrossPnl(e.target.value)} placeholder="0.00" autoFocus className={numCls} />
                  </Field>
                  <Field label="Fees / costs">
                    <input type="number" inputMode="decimal" min="0" step="any" value={fees}
                      onChange={e => setFees(e.target.value)} placeholder="0.00" className={numCls} />
                  </Field>
                </div>

                {/* Net P&L preview */}
                <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm flex items-center justify-between">
                  <span className="text-muted-foreground">Net P&L</span>
                  <span className={cn('font-mono font-bold', netPnl == null ? 'text-muted-foreground' : netPnl > 0 ? 'text-emerald-500' : netPnl < 0 ? 'text-red-500' : 'text-foreground')}>
                    {netPnl == null ? '—' : fmtMoney(netPnl, currency)}
                  </span>
                </div>

                {resultConflict && (
                  <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-300">
                    Net P&L is {netPnl > 0 ? 'positive' : netPnl < 0 ? 'negative' : 'zero'} — this will be saved as <b>{reconciled.result.toUpperCase()}</b> to match.
                  </div>
                )}

                {/* Account + balance preview */}
                {active.length > 1 && (
                  <Field label="Account">
                    <select value={accountId} onChange={e => setAccountId(e.target.value)}
                      className="w-full h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                      {active.map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
                    </select>
                  </Field>
                )}
                {account && netPnl != null && balanceBefore != null && (
                  <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Balance before</span><span className="font-mono">{fmtMoney(balanceBefore, currency)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Projected after</span><span className="font-mono font-semibold">{projected == null ? '—' : fmtMoney(projected, currency)}</span></div>
                  </div>
                )}

                {/* Risk + R */}
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Amount risked" hint="optional">
                    <input type="number" inputMode="decimal" min="0" step="any" value={risk}
                      onChange={e => setRisk(e.target.value)} placeholder="0.00" className={smallNumCls} />
                  </Field>
                  <div className="rounded-lg border border-border bg-secondary/30 px-3 py-1.5 text-xs flex flex-col justify-center">
                    <div className="flex justify-between"><span className="text-muted-foreground">R</span><span className="font-mono">{rMult == null ? '—' : `${rMult.toFixed(2)}R`}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Risk %</span><span className="font-mono">{rPct == null ? '—' : `${rPct.toFixed(2)}%`}</span></div>
                  </div>
                </div>

                {/* Toggle detail */}
                <button onClick={() => setShowDetail(s => !s)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                  {showDetail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {showDetail ? 'Fewer details' : 'More details (direction, size, pips, mood…)'}
                </button>

                {showDetail && (
                  <div className="space-y-3 border-t border-border/50 pt-3">
                    {/* Executed direction */}
                    <Field label="Trade taken" hint={engineBias ? `engine bias: ${engineBias}` : ''}>
                      <div className="grid grid-cols-2 gap-2">
                        {['long', 'short'].map(d => (
                          <button key={d} onClick={() => setTradeDir(d)}
                            className={cn('rounded-lg border py-2 text-sm font-semibold capitalize transition-all active:scale-95',
                              effectiveDir === d ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground')}>
                            {d}
                          </button>
                        ))}
                      </div>
                    </Field>

                    {/* Size + pips */}
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Position / bid size">
                        <input type="number" inputMode="decimal" min="0" step="any" value={positionSize}
                          onChange={e => setPositionSize(e.target.value)} placeholder="0.00" className={smallNumCls} />
                      </Field>
                      <Field label="Points / pips">
                        <input type="number" inputMode="decimal" step="any" value={pointsPips}
                          onChange={e => setPointsPips(e.target.value)} placeholder="explicit" className={smallNumCls} />
                      </Field>
                    </div>
                    {!pointsPips && estPts != null && (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                        ≈ {estPts} pts (estimated from net ÷ size)
                        <button onClick={() => setPointsPips(String(estPts))} className="text-primary hover:underline font-semibold">Use</button>
                      </div>
                    )}

                    {/* Split count */}
                    <Field label="Split count" hint="entries grouped into this trade">
                      <input type="number" inputMode="numeric" min="1" step="1" value={splitCount}
                        onChange={e => setSplitCount(e.target.value)} placeholder="1" className={smallNumCls} />
                    </Field>

                    {/* Mood */}
                    <Field label="Mood" hint="optional">
                      <div className="flex flex-wrap gap-1.5">
                        {MOODS.map(m => (
                          <button key={m} onClick={() => setMood(mood === m ? '' : m)}
                            className={cn('px-2.5 py-1 rounded-full border text-xs font-semibold capitalize transition-all active:scale-95',
                              mood === m ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground')}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </Field>

                    {/* Notes */}
                    <Field label="Why / notes" hint="optional">
                      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Reason for the trade, what happened…"
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                    </Field>

                    {/* Evidence */}
                    <button onClick={() => setShowEvidence(s => !s)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                      {showEvidence ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      Evidence (screenshot link / broker text)
                    </button>
                    {showEvidence && (
                      <div className="space-y-2">
                        <input type="url" value={screenshotUrl} onChange={e => setScreenshotUrl(e.target.value)} placeholder="Screenshot URL"
                          className={smallNumCls} />
                        <textarea value={brokerEvidence} onChange={e => setBrokerEvidence(e.target.value)} rows={2} placeholder="Paste broker history text (stored as evidence only — never auto-imported)"
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                      </div>
                    )}
                  </div>
                )}

                <Button className="w-full" onClick={() => save()}>Save</Button>
                <p className="text-[10px] text-muted-foreground text-center">
                  Leave Gross P&L blank to log the outcome now and add the financial result later.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}
