import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Trash2, RotateCcw, SlidersHorizontal, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { gradeText } from '@/lib/gradeStyles';
import { buildRestoredAnalysis, updateCompletedTrade, computeTradeFinancials } from '@/lib/tradeCompletion';
import { withDerivedFinancials, hasFinancialResult, activeAccounts } from '@/lib/accounts';
import { ensureDefaultAccount } from '@/lib/accountData';
import { financialCompletenessState, COMPLETENESS_LABEL, MOODS } from '@/lib/tradeFinancials';
import { normalizeTrade } from '@/lib/tradeCompat';
import { safeHttpUrl } from '@/lib/safeUrl';

const resultColors = {
  win:       'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  loss:      'text-red-400 bg-red-500/10 border-red-500/30',
  breakeven: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  not_taken: 'text-muted-foreground bg-secondary border-border',
};
const resultLabels = { win: 'Win', loss: 'Loss', breakeven: 'B/E', not_taken: 'Not Taken' };

function TradeDetailModal({ trade, onClose, onRestore, onArchive, onDelete, onEdit }) {
  if (!trade) return null;
  const complete = hasFinancialResult(trade);
  const directional = trade.result === 'win' || trade.result === 'loss';
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl overflow-y-auto"
        style={{ marginBottom: 'calc(64px + var(--safe-area-bottom))', maxHeight: 'calc(100vh - 120px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div>
            <div className="text-base font-bold">{trade.instrument}</div>
            <div className="text-xs text-muted-foreground">
              {trade.completed_at ? format(new Date(trade.completed_at), 'dd MMM yyyy HH:mm') : '—'}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          {/* Result badge */}
          <div className={cn('rounded-xl border px-4 py-3 text-center', resultColors[trade.result])}>
            <div className="text-xl font-bold">{resultLabels[trade.result] || '—'}</div>
            <div className="text-xs opacity-70">Result</div>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {[
              { label: 'Engine', value: trade.direction, cls: trade.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Taken', value: trade.trade_direction ? trade.trade_direction : '—', cls: 'capitalize' },
              { label: 'Grade', value: trade.grade, cls: gradeText(trade.grade) },
              { label: 'Score', value: trade.score, cls: 'text-foreground font-mono' },
              { label: 'Deep', value: trade.deep_trend, cls: '' },
              { label: 'DD', value: trade.dd_bias, cls: '' },
              { label: 'Now', value: trade.now_bias, cls: '' },
              { label: 'Alignment', value: trade.alignment, cls: '' },
              { label: 'Action', value: trade.trade_action, cls: '' },
              { label: 'Status', value: trade.trade_status, cls: '' },
            ].map(m => (
              <div key={m.label} className="bg-secondary rounded-lg p-2">
                <div className={cn('font-bold', m.cls)}>{m.value || '—'}</div>
                <div className="text-muted-foreground">{m.label}</div>
              </div>
            ))}
          </div>

          {/* Financial result */}
          {complete ? (
            <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Result</div>
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div><div className={cn('font-mono font-bold', trade.net_pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>{trade.net_pnl > 0 ? '+' : trade.net_pnl < 0 ? '−' : ''}{Math.abs(trade.net_pnl)}</div><div className="text-muted-foreground">Net P/L</div></div>
                {trade.fees != null && <div><div className="font-mono font-bold">{trade.fees}</div><div className="text-muted-foreground">Fees</div></div>}
                {trade.amount_risked != null && <div><div className="font-mono font-bold">{trade.amount_risked}</div><div className="text-muted-foreground">Risked</div></div>}
                {trade.entry_price && <div><div className="font-mono font-bold">{trade.entry_price}</div><div className="text-muted-foreground">Entry</div></div>}
                {trade.exit_price && <div><div className="font-mono font-bold">{trade.exit_price}</div><div className="text-muted-foreground">Exit</div></div>}
              </div>
            </div>
          ) : directional && (
            <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">No monetary result recorded yet.</div>
              <Button size="sm" className="gap-1.5 shrink-0" onClick={() => onEdit(trade)}>Add result</Button>
            </div>
          )}

          {/* Completeness badge */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{COMPLETENESS_LABEL[financialCompletenessState(trade)]}</span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEdit(trade)}>Edit trade</Button>
          </div>

          {trade.exit_reason && (
            <div><div className="text-xs text-muted-foreground mb-1">Exit Reason</div><p className="text-sm">{trade.exit_reason}</p></div>
          )}
          {trade.notes && (
            <div><div className="text-xs text-muted-foreground mb-1">Notes</div><p className="text-sm text-muted-foreground">{trade.notes}</p></div>
          )}
          {safeHttpUrl(trade.screenshot_url) && (
            <a href={safeHttpUrl(trade.screenshot_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-primary hover:underline">
              <ExternalLink className="w-3.5 h-3.5" /> View Screenshot
            </a>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => onRestore(trade)}>
              <RotateCcw className="w-3.5 h-3.5" /> Restore to Summary
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1 text-destructive hover:text-destructive gap-1.5" onClick={() => onArchive(trade)}>
                <Trash2 className="w-3.5 h-3.5" /> Archive
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 text-destructive hover:text-destructive gap-1.5" onClick={() => onDelete(trade)}>
                <X className="w-3.5 h-3.5" /> Delete
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const EDIT_RESULTS = ['win', 'loss', 'breakeven', 'not_taken'];
const editNum = 'w-full h-9 rounded-lg border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring';

// Convert an ISO timestamp to the value a datetime-local input expects.
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Full journal edit of a completed trade's REALISED fields. The immutable engine
// snapshot (grade, scores, timeframes, settings) is never shown or written here.
function EditTradeModal({ trade, saving, onClose, onSave }) {
  const { data: accounts = [] } = useQuery({
    queryKey: ['tradingAccounts'],
    queryFn: () => ensureDefaultAccount(),
    staleTime: 60_000,
  });
  const active = activeAccounts(accounts);

  const [result, setResult] = useState(trade?.result || '');
  const [grossPnl, setGrossPnl] = useState(trade?.gross_pnl ?? trade?.net_pnl ?? '');
  const [fees, setFees] = useState(trade?.fees ?? '');
  const [risk, setRisk] = useState(trade?.amount_risked ?? '');
  const [accountId, setAccountId] = useState(trade?.account_id ?? '');
  const [tradeDir, setTradeDir] = useState(trade?.trade_direction ?? '');
  const [positionSize, setPositionSize] = useState(trade?.position_size ?? '');
  const [pointsPips, setPointsPips] = useState(trade?.points_pips ?? '');
  const [splitCount, setSplitCount] = useState(trade?.split_count ?? 1);
  const [mood, setMood] = useState(trade?.mood ?? '');
  const [notes, setNotes] = useState(trade?.notes ?? '');
  const [entry, setEntry] = useState(trade?.entry_price ?? '');
  const [exit, setExit] = useState(trade?.exit_price ?? '');
  const [screenshotUrl, setScreenshotUrl] = useState(trade?.screenshot_url ?? '');
  const [brokerEvidence, setBrokerEvidence] = useState(trade?.broker_evidence ?? '');
  const [completedAt, setCompletedAt] = useState(toLocalInput(trade?.completed_at));

  if (!trade) return null;
  const net = result === 'not_taken' ? null : computeTradeFinancials({ result, grossPnl, fees }).netPnl;

  const submit = () => onSave({
    result,
    grossPnl: result === 'not_taken' ? undefined : grossPnl,
    fees, amountRisked: risk, accountId,
    tradeDirection: result === 'not_taken' ? undefined : tradeDir,
    positionSize, pointsPips, splitCount, mood, notes, entry, exit,
    screenshotUrl, brokerEvidence,
    completedAt: completedAt ? new Date(completedAt).toISOString() : undefined,
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl overflow-y-auto"
        style={{ marginBottom: 'calc(64px + var(--safe-area-bottom))', maxHeight: 'calc(100vh - 120px)' }}
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card px-4 py-3 border-b border-border flex items-center justify-between z-10">
          <div>
            <div className="text-base font-bold">Edit trade</div>
            <div className="text-xs text-muted-foreground font-mono">{trade.instrument} · engine {trade.direction} · grade {trade.grade}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Result</div>
            <div className="grid grid-cols-4 gap-1.5">
              {EDIT_RESULTS.map(r => (
                <button key={r} onClick={() => setResult(r)}
                  className={cn('rounded-lg border py-1.5 text-[11px] font-bold', result === r ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground')}>
                  {resultLabels[r]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div><div className="text-xs text-muted-foreground mb-1">Gross P&L (loss = negative)</div>
              <input type="number" step="any" value={grossPnl} onChange={e => setGrossPnl(e.target.value)} className={editNum} /></div>
            <div><div className="text-xs text-muted-foreground mb-1">Fees / costs</div>
              <input type="number" min="0" step="any" value={fees} onChange={e => setFees(e.target.value)} className={editNum} /></div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 flex justify-between text-xs">
            <span className="text-muted-foreground">Net P&L</span>
            <span className={cn('font-mono font-bold', net == null ? 'text-muted-foreground' : net > 0 ? 'text-emerald-500' : net < 0 ? 'text-red-500' : '')}>{net == null ? '—' : net}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div><div className="text-xs text-muted-foreground mb-1">Amount risked</div>
              <input type="number" min="0" step="any" value={risk} onChange={e => setRisk(e.target.value)} className={editNum} /></div>
            <div><div className="text-xs text-muted-foreground mb-1">Account</div>
              <select value={accountId} onChange={e => setAccountId(e.target.value)} className={editNum}>
                <option value="">Unassigned</option>
                {active.map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
              </select></div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Trade taken (engine bias: {trade.direction})</div>
            <div className="grid grid-cols-3 gap-1.5">
              {['long', 'short', ''].map(d => (
                <button key={d || 'none'} onClick={() => setTradeDir(d)}
                  className={cn('rounded-lg border py-1.5 text-xs font-semibold capitalize', tradeDir === d ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground')}>
                  {d || '—'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div><div className="text-xs text-muted-foreground mb-1">Position size</div>
              <input type="number" min="0" step="any" value={positionSize} onChange={e => setPositionSize(e.target.value)} className={editNum} /></div>
            <div><div className="text-xs text-muted-foreground mb-1">Points / pips</div>
              <input type="number" step="any" value={pointsPips} onChange={e => setPointsPips(e.target.value)} className={editNum} /></div>
            <div><div className="text-xs text-muted-foreground mb-1">Split count</div>
              <input type="number" min="1" step="1" value={splitCount} onChange={e => setSplitCount(e.target.value)} className={editNum} /></div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Mood</div>
            <div className="flex flex-wrap gap-1.5">
              {MOODS.map(m => (
                <button key={m} onClick={() => setMood(mood === m ? '' : m)}
                  className={cn('px-2.5 py-1 rounded-full border text-xs font-semibold capitalize', mood === m ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary text-muted-foreground')}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div><div className="text-xs text-muted-foreground mb-1">Entry price</div>
              <input type="number" step="any" value={entry} onChange={e => setEntry(e.target.value)} className={editNum} /></div>
            <div><div className="text-xs text-muted-foreground mb-1">Exit price</div>
              <input type="number" step="any" value={exit} onChange={e => setExit(e.target.value)} className={editNum} /></div>
          </div>

          <div><div className="text-xs text-muted-foreground mb-1">Completed at</div>
            <input type="datetime-local" value={completedAt} onChange={e => setCompletedAt(e.target.value)} className={editNum} /></div>

          <div><div className="text-xs text-muted-foreground mb-1">Why / notes</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" /></div>

          <div><div className="text-xs text-muted-foreground mb-1">Evidence</div>
            <input type="url" value={screenshotUrl} onChange={e => setScreenshotUrl(e.target.value)} placeholder="Screenshot URL" className={cn(editNum, 'mb-2')} />
            <textarea value={brokerEvidence} onChange={e => setBrokerEvidence(e.target.value)} rows={2} placeholder="Paste broker history text (evidence only — never auto-imported)"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-none" /></div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const ALL_RESULTS = ['win', 'loss', 'breakeven', 'not_taken'];
const ALL_GRADES  = ['A', 'B', 'C', 'D', 'F'];

export default function TradeHistory() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ result: '', grade: '', direction: '', asset: '' });

  const [editing, setEditing] = useState(null);

  const { data: rawTrades = [], isLoading } = useQuery({
    queryKey: ['completedTrades'],
    queryFn: () => base44.entities.CompletedTrade.filter({ status: 'completed' }, '-completed_at', 200),
  });
  const trades = rawTrades.map(t => normalizeTrade(withDerivedFinancials(t)));



  const updateMutation = useMutation({
    mutationFn: /** @param {{ id: string, data: any }} vars */ ({ id, data }) => base44.entities.CompletedTrade.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['completedTrades'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (/** @type {string} */ id) => base44.entities.CompletedTrade.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['completedTrades'] }),
  });

  const handleRestore = async (trade) => {
    // Put back into active localStorage.
    // A fresh analysisId is essential: the Dashboard filters active analyses by
    // `!isAnalysisLocked(analysisId)`, and completion locks are keyed by analysisId.
    // Without one, the restored card can never be cleared by completing it and each
    // completion would insert a duplicate trade record.
    const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
    active[trade.instrument] = buildRestoredAnalysis(trade);
    localStorage.setItem('primebias_active', JSON.stringify(active));
    window.dispatchEvent(new Event('biasUpdated'));

    await updateMutation.mutateAsync({ id: trade.id, data: { status: 'archived' } });
    setSelected(null);
    toast.success(`${trade.instrument} restored to Summary`);
  };

  const handleArchive = async (trade) => {
    await updateMutation.mutateAsync({ id: trade.id, data: { status: 'archived' } });
    setSelected(null);
    toast.success('Trade archived');
  };

  // Open a confirmation first — delete is permanent and can't be undone.
  const handleDelete = (trade) => {
    setSelected(null);
    setConfirmDelete(trade);
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    await deleteMutation.mutateAsync(confirmDelete.id);
    setConfirmDelete(null);
    toast.success('Trade deleted');
  };

  const handleEdit = (trade) => {
    setSelected(null);
    setEditing(trade);
  };

  // Journal edit: updates the intended row via the shared realised-fields model.
  // The immutable engine snapshot is never included, so it cannot be overwritten.
  const editMutation = useMutation({
    mutationFn: /** @param {{ id: string, details: any }} vars */ ({ id, details }) => updateCompletedTrade(id, details),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['completedTrades'] });
      queryClient.invalidateQueries({ queryKey: ['tradingAccounts'] });
      queryClient.invalidateQueries({ queryKey: ['accountTransactions'] });
    },
  });

  const saveEdit = async (details) => {
    if (!editing) return;
    await editMutation.mutateAsync({ id: editing.id, details });
    setEditing(null);
    toast.success('Trade updated');
  };

  const assets = [...new Set(trades.map(t => t.instrument))].sort();

  let filtered = trades;
  if (filters.result)    filtered = filtered.filter(t => t.result === filters.result);
  if (filters.grade)     filtered = filtered.filter(t => t.grade === filters.grade);
  if (filters.direction) filtered = filtered.filter(t => t.direction === filters.direction);
  if (filters.asset)     filtered = filtered.filter(t => t.instrument === filters.asset);

  const activeFilters = Object.values(filters).filter(Boolean).length;

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Trade History</h1>
          <p className="text-xs text-muted-foreground">{trades.length} completed trades</p>
        </div>
        <button
          onClick={() => setShowFilters(f => !f)}
          className={cn(
            'relative p-2 rounded-lg border transition-colors',
            showFilters ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'
          )}
        >
          <SlidersHorizontal className="w-4 h-4" />
          {activeFilters > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">
              {activeFilters}
            </span>
          )}
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="space-y-2 rounded-xl border border-border bg-card p-3">
          <div className="grid grid-cols-2 gap-2">
            {/* Result */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Result</div>
              <div className="flex flex-wrap gap-1">
                {ALL_RESULTS.map(r => (
                  <button key={r} onClick={() => setFilters(f => ({ ...f, result: f.result === r ? '' : r }))}
                    className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold border',
                      filters.result === r ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground'
                    )}>
                    {resultLabels[r]}
                  </button>
                ))}
              </div>
            </div>
            {/* Grade */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Grade</div>
              <div className="flex flex-wrap gap-1">
                {ALL_GRADES.map(g => (
                  <button key={g} onClick={() => setFilters(f => ({ ...f, grade: f.grade === g ? '' : g }))}
                    className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold border',
                      filters.grade === g ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground'
                    )}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* Direction */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Direction</div>
              <div className="flex gap-1">
                {['BUY','SELL'].map(d => (
                  <button key={d} onClick={() => setFilters(f => ({ ...f, direction: f.direction === d ? '' : d }))}
                    className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold border',
                      filters.direction === d ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground'
                    )}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            {/* Asset */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Asset</div>
              <select
                value={filters.asset}
                onChange={e => setFilters(f => ({ ...f, asset: e.target.value }))}
                className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none"
              >
                <option value="">All</option>
                {assets.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          {activeFilters > 0 && (
            <button onClick={() => setFilters({ result: '', grade: '', direction: '', asset: '' })}
              className="text-xs text-primary hover:underline">Clear filters</button>
          )}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-secondary animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {trades.length === 0 ? 'No completed trades yet. Use "Complete Trade" on the Summary page.' : 'No trades match the current filters.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(trade => (
            <button
              key={trade.id}
              onClick={() => setSelected(trade)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:bg-accent/50 transition-colors text-left"
            >
              {/* Result badge */}
              <div className={cn('px-2.5 py-1 rounded-lg border text-xs font-bold shrink-0', resultColors[trade.result])}>
                {resultLabels[trade.result] || '—'}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{trade.instrument}</span>
                  <span className={cn('text-xs font-bold', gradeText(trade.grade))}>{trade.grade}</span>
                  <span className={cn('text-xs font-semibold', trade.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400')}>{trade.direction}</span>

                </div>
                <div className="text-[11px] text-muted-foreground">
                  {trade.completed_at ? format(new Date(trade.completed_at), 'dd MMM yyyy HH:mm') : '—'}
                  {hasFinancialResult(trade) ? (
                    <span className={cn('ml-2 font-semibold', trade.net_pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {trade.net_pnl > 0 ? '+' : trade.net_pnl < 0 ? '−' : ''}{Math.abs(trade.net_pnl)}
                    </span>
                  ) : (trade.result === 'win' || trade.result === 'loss') && (
                    <span className="ml-2 text-primary font-semibold">Add result</span>
                  )}
                </div>
              </div>
              {/* Score */}
              <div className="text-right shrink-0">
                <div className="font-mono text-xs font-bold">{trade.score}</div>
                <div className="text-[10px] text-muted-foreground">score</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <TradeDetailModal
          trade={selected}
          onClose={() => setSelected(null)}
          onRestore={handleRestore}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onEdit={handleEdit}
        />
      )}

      {editing && (
        <EditTradeModal
          trade={editing}
          saving={editMutation.isPending}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this trade?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.instrument} will be permanently removed from your trade history.
              This can’t be undone. To keep it out of your stats but retain the record, use Archive instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}