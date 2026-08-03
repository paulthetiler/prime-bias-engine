import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ensureDefaultAccount } from '@/lib/accountData';
import { accountBalance, activeAccounts, withDerivedFinancials } from '@/lib/accounts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Plus, X, Wallet, Archive } from 'lucide-react';
import { toast } from 'sonner';

const CURRENCIES = ['USD', 'GBP', 'EUR', 'AUD', 'CAD', 'JPY', 'CHF', 'NZD', 'BTC', 'USDT'];
const TXN_TYPES = [
  { value: 'deposit', label: 'Deposit', hint: 'Money paid into the account' },
  { value: 'withdrawal', label: 'Withdrawal', hint: 'Money taken out of the account' },
  { value: 'adjustment', label: 'Adjustment', hint: 'Reconcile a discrepancy (can be + or −)' },
];

const fmt = (n, cur) => (n == null || !Number.isFinite(n) ? '—' : `${cur ? cur + ' ' : ''}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);

// Add a deposit / withdrawal / adjustment. The user types a positive magnitude
// for deposits/withdrawals; adjustments accept a signed value so a discrepancy
// can be corrected in either direction.
function TransactionModal({ account, saving, onClose, onSave }) {
  const [type, setType] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  if (!account) return null;
  const signed = type === 'adjustment';

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl"
        style={{ marginBottom: 'calc(64px + var(--safe-area-bottom))' }} onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-base font-bold">Add transaction</div>
            <div className="text-xs text-muted-foreground">{account.name} · {account.currency}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {TXN_TYPES.map(t => (
              <button key={t.value} onClick={() => setType(t.value)}
                className={cn('rounded-lg border-2 py-2 text-xs font-semibold transition-all',
                  type === t.value ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-secondary text-muted-foreground')}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">{TXN_TYPES.find(t => t.value === type)?.hint}</p>
          <div>
            <label className="text-xs font-semibold block mb-1">Amount{signed ? ' (use − for a reduction)' : ` (${account.currency})`}</label>
            <input type="number" inputMode="decimal" step="any" min={signed ? undefined : '0'} value={amount}
              onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus
              className="w-full h-11 rounded-lg border border-input bg-background px-3 text-base font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Date (optional)</label>
            <input type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)}
              className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. broker top-up"
              className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={saving || amount === ''}
              onClick={() => onSave({ type, amount, note, occurredAt })}>Save</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AccountsManager() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [startingBalance, setStartingBalance] = useState('');
  const [txnFor, setTxnFor] = useState(null);

  const { data: accounts = [] } = useQuery({ queryKey: ['tradingAccounts'], queryFn: () => ensureDefaultAccount(), staleTime: 60_000 });
  const { data: txns = [] } = useQuery({ queryKey: ['accountTransactions'], queryFn: () => base44.entities.AccountTransaction.list('occurred_at', 500) });
  const { data: rawTrades = [] } = useQuery({ queryKey: ['completedTrades'], queryFn: () => base44.entities.CompletedTrade.filter({ status: 'completed' }, '-completed_at', 200) });
  const trades = useMemo(() => rawTrades.map(withDerivedFinancials), [rawTrades]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tradingAccounts'] });
    qc.invalidateQueries({ queryKey: ['accountTransactions'] });
  };

  const createAccount = useMutation({
    mutationFn: (/** @type {any} */ data) => base44.entities.TradingAccount.create(data),
    onSuccess: () => { invalidate(); setCreating(false); setName(''); setStartingBalance(''); toast.success('Account created'); },
    onError: () => toast.error('Failed to create account'),
  });
  const archiveAccount = useMutation({
    mutationFn: (/** @type {string} */ id) => base44.entities.TradingAccount.update(id, { archived_at: new Date().toISOString() }),
    onSuccess: () => { invalidate(); toast.success('Account archived'); },
  });
  const addTxn = useMutation({
    mutationFn: (/** @type {any} */ data) => base44.entities.AccountTransaction.create(data),
    onSuccess: () => { invalidate(); setTxnFor(null); toast.success('Transaction added'); },
    onError: () => toast.error('Failed to add transaction'),
  });

  const active = activeAccounts(accounts);
  const soleId = active.length === 1 ? active[0].id : null;

  const balanceOf = (acc) => {
    const accTxns = txns.filter(t => t.account_id === acc.id);
    const accTrades = trades.filter(t => (t.account_id ?? soleId) === acc.id);
    return accountBalance(acc, accTxns, accTrades);
  };

  const submitAccount = () => {
    const sb = parseFloat(startingBalance);
    createAccount.mutate({
      name: name.trim() || 'Account',
      currency,
      starting_balance: Number.isFinite(sb) ? sb : 0,
      created_at: new Date().toISOString(),
    });
  };

  const saveTxn = ({ type, amount, note, occurredAt }) => {
    const raw = parseFloat(amount);
    if (!Number.isFinite(raw)) { toast.error('Enter an amount'); return; }
    // Deposits/withdrawals store a positive magnitude; adjustments keep the sign.
    const value = type === 'adjustment' ? raw : Math.abs(raw);
    addTxn.mutate({
      account_id: txnFor.id,
      type,
      amount: value,
      occurred_at: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
      note: note?.trim() || null,
    });
  };

  return (
    <div className="border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-muted-foreground" />
          <div className="text-sm font-semibold">Trading accounts</div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCreating(c => !c)}>
          <Plus className="w-3.5 h-3.5" /> New
        </Button>
      </div>

      {creating && (
        <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. FTMO Challenge"
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="w-full h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Starting balance</label>
              <input type="number" inputMode="decimal" step="any" value={startingBalance} onChange={e => setStartingBalance(e.target.value)} placeholder="0.00"
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setCreating(false)}>Cancel</Button>
            <Button size="sm" className="flex-1" disabled={createAccount.isPending} onClick={submitAccount}>Create</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {active.map(acc => (
          <div key={acc.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{acc.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {acc.currency} · start {fmt(Number(acc.starting_balance), acc.currency)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-sm font-bold tabular-nums">{fmt(balanceOf(acc), acc.currency)}</div>
                <div className="text-[10px] text-muted-foreground">balance</div>
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <Button variant="secondary" size="sm" className="flex-1 gap-1.5" onClick={() => setTxnFor(acc)}>
                <Plus className="w-3.5 h-3.5" /> Transaction
              </Button>
              {active.length > 1 && (
                <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5" onClick={() => archiveAccount.mutate(acc.id)}>
                  <Archive className="w-3.5 h-3.5" /> Archive
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Balance is calculated: starting balance + deposits − withdrawals + realised trade P/L + adjustments. It is never overwritten.
      </p>

      {txnFor && (
        <TransactionModal
          account={txnFor}
          saving={addTxn.isPending}
          onClose={() => setTxnFor(null)}
          onSave={saveTxn}
        />
      )}
    </div>
  );
}
