import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { calcAlignment } from '@/lib/alignmentUtils';
import { toast } from 'sonner';
import { getSettings } from '@/lib/userSettings';

const RESULTS = [
  { value: 'win',       label: 'WIN',       emoji: '✅', color: 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  { value: 'loss',      label: 'LOSS',      emoji: '❌', color: 'border-red-500 bg-red-500/15 text-red-600 dark:text-red-400' },
  { value: 'breakeven', label: 'BREAK EVEN',emoji: '➖', color: 'border-yellow-500 bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' },
  { value: 'not_taken', label: 'NOT TAKEN', emoji: '🚫', color: 'border-muted-foreground/50 bg-secondary text-muted-foreground' },
];

async function saveTrade({ analysis, result, entry, exit, pnl, exitReason, notes, screenshotUrl }) {
  const { instrument, results, targetInfo, inputs, extraCheck, timestamp } = analysis;
  const alignment = calcAlignment(results);

  const record = await base44.entities.CompletedTrade.create({
    instrument,
    status: 'completed',
    result,
    direction: results?.mainDirection,
    grade: results?.grade,
    trade_status: results?.status,
    trade_action: results?.tradeAction,
    score: results?.winningScore,
    target: targetInfo?.target || null,
    alignment: alignment.label,
    deep_trend: results?.deepTrend,
    deep_strength: results?.deepStrength,
    dd_bias: results?.ddBias,
    dd_strength: results?.ddStrength,
    now_bias: results?.nowBias,
    now_strength: results?.nowStrength,
    extra_check_h1: extraCheck?.h1 ?? null,
    extra_check_m15: extraCheck?.m15 ?? null,
    inputs_snapshot: inputs || {},
    created_at: timestamp || new Date().toISOString(),
    completed_at: new Date().toISOString(),
    entry_price: entry ? parseFloat(entry) : null,
    exit_price: exit ? parseFloat(exit) : null,
    pnl: pnl ? parseFloat(pnl) : null,
    exit_reason: exitReason || null,
    notes: notes || null,
    screenshot_url: screenshotUrl || null,
  });

  // Remove from active set
  const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
  delete active[instrument];
  localStorage.setItem('primebias_active', JSON.stringify(active));
  window.dispatchEvent(new Event('biasUpdated'));

  return record;
}

// ── Quick mode: one-tap flow ─────────────────────────────────────────────────
function QuickCompleteModal({ analysis, onClose, onCompleted }) {
  const [phase, setPhase] = useState('pick'); // 'pick' | 'details'
  const [selectedResult, setSelectedResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  // optional details
  const [entry, setEntry] = useState('');
  const [exit, setExit] = useState('');
  const [pnl, setPnl] = useState('');
  const [exitReason, setExitReason] = useState('');
  const [notes, setNotes] = useState('');
  const savedRecordRef = useRef(null);

  if (!analysis) return null;
  const { instrument, results } = analysis;

  const handlePick = async (resultValue) => {
    setSelectedResult(resultValue);
    setSaving(true);

    const record = await saveTrade({ analysis, result: resultValue, entry: '', exit: '', pnl: '', exitReason: '', notes: '', screenshotUrl: '' });
    savedRecordRef.current = record;
    setSaving(false);
    setPhase('followup');

    const label = RESULTS.find(r => r.value === resultValue)?.label || resultValue;
    toast(`${instrument} — ${label}`, {
      description: 'Saved to Trade History',
      action: {
        label: 'Undo',
        onClick: async () => {
          if (savedRecordRef.current?.id) {
            await base44.entities.CompletedTrade.delete(savedRecordRef.current.id);
          }
          // Restore to active
          const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
          active[instrument] = analysis;
          localStorage.setItem('primebias_active', JSON.stringify(active));
          window.dispatchEvent(new Event('biasUpdated'));
          toast.success(`${instrument} restored to Summary`);
          onCompleted();
        },
      },
      duration: 6000,
    });
  };

  const handleAddDetails = async () => {
    if (!savedRecordRef.current?.id) return;
    setSaving(true);
    await base44.entities.CompletedTrade.update(savedRecordRef.current.id, {
      entry_price: entry ? parseFloat(entry) : null,
      exit_price: exit ? parseFloat(exit) : null,
      pnl: pnl ? parseFloat(pnl) : null,
      exit_reason: exitReason || null,
      notes: notes || null,
    });
    setSaving(false);
    toast.success('Details added');
    onCompleted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={phase === 'pick' ? onClose : undefined}>
      <div
        className="w-full max-w-sm bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <div className="text-sm font-bold">Complete Trade</div>
            <div className="text-xs text-muted-foreground font-mono">{instrument}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Snapshot pill */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className={cn('font-bold', results?.mainDirection === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
              {results?.mainDirection}
            </span>
            <span>Grade <span className="text-foreground font-semibold">{results?.grade}</span></span>
            <span>Score <span className="text-foreground font-mono font-semibold">{results?.winningScore}</span></span>
          </div>
        </div>

        <div className="px-4 pb-5 space-y-3">
          {phase === 'pick' && (
            <>
              {saving ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving…
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {RESULTS.map(r => (
                    <button
                      key={r.value}
                      onClick={() => handlePick(r.value)}
                      className={cn(
                        'rounded-xl border-2 py-4 text-sm font-bold transition-all active:scale-95',
                        'border-border bg-secondary text-foreground hover:border-primary/50 hover:bg-primary/5'
                      )}
                    >
                      <div className="text-2xl mb-1">{r.emoji}</div>
                      <div>{r.label}</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {phase === 'followup' && (
            <div className="space-y-3">
              {/* Confirmation */}
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-300 font-semibold text-center">
                {RESULTS.find(r => r.value === selectedResult)?.emoji} {RESULTS.find(r => r.value === selectedResult)?.label} — saved!
              </div>

              {/* Optional details toggle */}
              <button
                onClick={() => setShowDetails(d => !d)}
                className="w-full flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>Add details (optional)</span>
                {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showDetails && (
                <div className="space-y-2.5 border border-border rounded-xl p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-1">Entry Price</label>
                      <input type="number" step="any" value={entry} onChange={e => setEntry(e.target.value)} placeholder="1.2500"
                        className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-1">Exit Price</label>
                      <input type="number" step="any" value={exit} onChange={e => setExit(e.target.value)} placeholder="1.2600"
                        className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">P&L</label>
                    <input type="number" step="any" value={pnl} onChange={e => setPnl(e.target.value)} placeholder="+50 or -25"
                      className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">Notes</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What happened?" rows={2}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {showDetails && (
                  <Button className="flex-1" onClick={handleAddDetails} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Details'}
                  </Button>
                )}
                <Button variant={showDetails ? 'outline' : 'default'} className="flex-1" onClick={onCompleted}>
                  {showDetails ? 'Skip' : 'Done'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Detailed mode: full form ─────────────────────────────────────────────────
function DetailedCompleteModal({ analysis, onClose, onCompleted }) {
  const [result, setResult] = useState('');
  const [entry, setEntry] = useState('');
  const [exit, setExit] = useState('');
  const [pnl, setPnl] = useState('');
  const [exitReason, setExitReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  if (!analysis) return null;
  const { instrument, results } = analysis;

  const handleSave = async () => {
    if (!result) { toast.error('Please select a result'); return; }
    setSaving(true);
    await saveTrade({ analysis, result, entry, exit, pnl, exitReason, notes, screenshotUrl: '' });
    toast.success(`${instrument} saved to Trade History`);
    setSaving(false);
    onCompleted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div>
            <div className="text-base font-bold">Complete Trade</div>
            <div className="text-xs text-muted-foreground">{instrument}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="rounded-xl bg-secondary/50 border border-border p-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <div className={cn('font-bold text-sm', results?.mainDirection === 'BUY' ? 'text-emerald-400' : 'text-red-400')}>{results?.mainDirection}</div>
              <div className="text-muted-foreground">Direction</div>
            </div>
            <div>
              <div className="font-bold text-sm">{results?.grade}</div>
              <div className="text-muted-foreground">Grade</div>
            </div>
            <div>
              <div className="font-bold text-sm font-mono">{results?.winningScore}</div>
              <div className="text-muted-foreground">Score</div>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Result *</div>
            <div className="grid grid-cols-2 gap-2">
              {RESULTS.map(r => (
                <button key={r.value} onClick={() => setResult(r.value)}
                  className={cn('rounded-xl border-2 p-3 text-sm font-semibold text-left transition-all',
                    result === r.value ? r.color : 'border-border bg-secondary text-muted-foreground hover:border-primary/40')}>
                  {r.emoji} {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Trade Details (optional)</div>
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
              <label className="text-xs text-muted-foreground block mb-1">P&L</label>
              <input type="number" step="any" value={pnl} onChange={e => setPnl(e.target.value)} placeholder="+50 or -25"
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
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
      </div>
    </div>
  );
}

// ── Entry point: pick mode from settings ─────────────────────────────────────
export default function CompleteTradeModal({ analysis, onClose, onCompleted }) {
  const settings = getSettings();
  if (settings.tradeCompletionMode === 'detailed') {
    return <DetailedCompleteModal analysis={analysis} onClose={onClose} onCompleted={onCompleted} />;
  }
  return <QuickCompleteModal analysis={analysis} onClose={onClose} onCompleted={onCompleted} />;
}