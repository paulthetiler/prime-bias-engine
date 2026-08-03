import React, { useState, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getSettings } from '@/lib/userSettings';
import { completeTrade } from '@/lib/tradeCompletion';
import { ensureDefaultAccount } from '@/lib/accountData';
import { activeAccounts } from '@/lib/accounts';
import { celebrateWin } from '@/lib/celebrate';
import { tap } from '@/lib/haptics';

const RESULTS = [
  { value: 'win',       label: 'WIN',        emoji: '✅', color: 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  { value: 'loss',      label: 'LOSS',       emoji: '❌', color: 'border-red-500 bg-red-500/15 text-red-600 dark:text-red-400' },
  { value: 'breakeven', label: 'BREAK EVEN', emoji: '➖', color: 'border-yellow-500 bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' },
  { value: 'not_taken', label: 'NOT TAKEN',  emoji: '🚫', color: 'border-muted-foreground/50 bg-secondary text-muted-foreground' },
];

// Shared hook: resolve the user's trading accounts (creating a default if none)
// and track the selected one. The amount/fees/risk state lives here too so both
// the quick and detailed modals share identical money-capture behaviour.
function useTradeMoney() {
  const { data: accounts = [] } = useQuery({
    queryKey: ['tradingAccounts'],
    queryFn: () => ensureDefaultAccount(),
    staleTime: 60_000,
  });
  const active = useMemo(() => activeAccounts(accounts), [accounts]);
  const [accountId, setAccountId] = useState('');
  const resolvedAccountId = accountId || active[0]?.id || '';
  const currency = active.find(a => a.id === resolvedAccountId)?.currency || '';
  return { active, accountId: resolvedAccountId, setAccountId, currency };
}

/**
 * The money inputs. The user always types a POSITIVE number; the outcome decides
 * the sign, so nobody ever types a minus. Amount is hidden for break-even/not-taken.
 */
function MoneyFields({ result, amount, setAmount, fees, setFees, risk, setRisk, currency, accounts, accountId, setAccountId }) {
  const showAmount = result === 'win' || result === 'loss';
  const amountLabel = result === 'loss' ? 'Amount lost' : 'Amount made';
  const unit = currency ? ` (${currency})` : '';
  return (
    <div className="space-y-2.5">
      {showAmount && (
        <div>
          <label className="text-xs font-semibold text-foreground block mb-1">
            {amountLabel}{unit}
            {result === 'loss' && <span className="text-muted-foreground font-normal"> — enter a positive number</span>}
          </label>
          <input
            type="number" inputMode="decimal" min="0" step="any" value={amount}
            onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus
            className="w-full h-11 rounded-lg border border-input bg-background px-3 text-base font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Fees (optional)</label>
          <input
            type="number" inputMode="decimal" min="0" step="any" value={fees}
            onChange={e => setFees(e.target.value)} placeholder="0.00"
            className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Risked (optional)</label>
          <input
            type="number" inputMode="decimal" min="0" step="any" value={risk}
            onChange={e => setRisk(e.target.value)} placeholder="0.00"
            className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
      {accounts.length > 1 && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Account</label>
          <select
            value={accountId} onChange={e => setAccountId(e.target.value)}
            className="w-full h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function ModalShell({ instrument, results, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className={cn('w-full bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl overflow-y-auto', wide ? 'max-w-md' : 'max-w-sm')}
        style={{ marginBottom: 'calc(64px + var(--safe-area-bottom))', maxHeight: 'calc(100vh - 120px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div>
            <div className="text-base font-bold">Complete Trade</div>
            <div className="text-xs text-muted-foreground font-mono">{instrument}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X className="w-4 h-4" /></button>
        </div>
        {results && (
          <div className="px-4 pt-3">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className={cn('font-bold', results?.mainDirection === 'BUY' ? 'text-primary' : 'text-destructive')}>{results?.mainDirection}</span>
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

// ── Quick mode ────────────────────────────────────────────────────────────────
function QuickCompleteModal({ analysis, onClose, onCompleted }) {
  const { active, accountId, setAccountId, currency } = useTradeMoney();
  const [result, setResult] = useState('');
  const [amount, setAmount] = useState('');
  const [fees, setFees] = useState('');
  const [risk, setRisk] = useState('');
  const [saving, setSaving] = useState(false);
  const processingRef = useRef(false);

  if (!analysis) return null;
  const { instrument, results } = analysis;

  const save = async (chosen = result) => {
    if (!chosen) { toast.error('Select a result'); return; }
    if (processingRef.current) return;
    processingRef.current = true;
    setSaving(true);
    let record;
    try {
      record = await completeTrade(analysis, chosen, { amount, fees, amountRisked: risk, accountId });
    } catch {
      setSaving(false);
      processingRef.current = false;
      toast.error('Failed to save trade. Please try again.');
      return;
    }
    const label = RESULTS.find(r => r.value === chosen)?.label || chosen;
    toast.success(`${instrument} saved as ${label}`);
    if (chosen === 'win') celebrateWin();
    setSaving(false);
    onClose();
    onCompleted?.(record);
  };

  const onPick = (value) => {
    setResult(value);
    // Not-taken carries no money, so save straight away — keeps the flow quick.
    if (value === 'not_taken') save('not_taken');
  };

  const showMoney = result && result !== 'not_taken';

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
                <MoneyFields
                  result={result}
                  amount={amount} setAmount={setAmount}
                  fees={fees} setFees={setFees}
                  risk={risk} setRisk={setRisk}
                  currency={currency}
                  accounts={active} accountId={accountId} setAccountId={setAccountId}
                />
                <Button className="w-full" onClick={() => save()}>Save</Button>
                <p className="text-[10px] text-muted-foreground text-center">
                  Leave the amount blank to log the outcome now and add the result later.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}

// ── Detailed mode ─────────────────────────────────────────────────────────────
function DetailedCompleteModal({ analysis, onClose, onCompleted }) {
  const { active, accountId, setAccountId, currency } = useTradeMoney();
  const [result, setResult] = useState('');
  const [amount, setAmount] = useState('');
  const [fees, setFees] = useState('');
  const [risk, setRisk] = useState('');
  const [entry, setEntry] = useState('');
  const [exit, setExit] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const processingRef = useRef(false);

  if (!analysis) return null;
  const { instrument, results } = analysis;

  const handleSave = async () => {
    if (!result) { toast.error('Please select a result'); return; }
    if (processingRef.current) return;
    processingRef.current = true;
    setSaving(true);
    let record;
    try {
      record = await completeTrade(analysis, result, {
        amount, fees, amountRisked: risk, accountId, entry, exit, notes,
      });
    } catch {
      setSaving(false);
      processingRef.current = false;
      toast.error('Failed to save trade. Please try again.');
      return;
    }
    const label = RESULTS.find(r => r.value === result)?.label || result;
    toast.success(`${instrument} saved as ${label}`);
    if (result === 'win') celebrateWin();
    setSaving(false);
    onClose();
    onCompleted?.(record);
  };

  const showMoney = result && result !== 'not_taken';

  return (
    <ModalShell instrument={instrument} results={results} onClose={onClose} wide>
      <div className="p-4 space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Result *</div>
          <ResultPicker result={result} onPick={setResult} saving={saving} />
        </div>

        {showMoney && (
          <MoneyFields
            result={result}
            amount={amount} setAmount={setAmount}
            fees={fees} setFees={setFees}
            risk={risk} setRisk={setRisk}
            currency={currency}
            accounts={active} accountId={accountId} setAccountId={setAccountId}
          />
        )}

        <div className="space-y-2.5">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Execution (optional)</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Entry Price</label>
              <input type="number" step="any" value={entry} onChange={e => setEntry(e.target.value)} placeholder="1.2500"
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Exit Price</label>
              <input type="number" step="any" value={exit} onChange={e => setExit(e.target.value)} placeholder="1.2600"
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What happened? What did you learn?" rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving || !result}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save to History'}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Entry point ───────────────────────────────────────────────────────────────
export default function CompleteTradeModal({ analysis, onClose, onCompleted }) {
  const settings = getSettings();
  if (settings.tradeCompletionMode === 'detailed') {
    return <DetailedCompleteModal analysis={analysis} onClose={onClose} onCompleted={onCompleted} />;
  }
  return <QuickCompleteModal analysis={analysis} onClose={onClose} onCompleted={onCompleted} />;
}
