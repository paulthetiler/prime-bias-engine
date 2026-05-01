import React, { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { X, Loader2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getSettings } from '@/lib/userSettings';
import { completeTrade, undoCompletion } from '@/lib/tradeCompletion';
import TradeJournalFlow from '@/components/journal/TradeJournalFlow';

function getAnalysisId(analysis) {
  return analysis?.analysisId;
}

const RESULTS = [
  { value: 'win',       label: 'WIN',        emoji: '✅', color: 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  { value: 'loss',      label: 'LOSS',       emoji: '❌', color: 'border-red-500 bg-red-500/15 text-red-600 dark:text-red-400' },
  { value: 'breakeven', label: 'BREAK EVEN', emoji: '➖', color: 'border-yellow-500 bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' },
  { value: 'not_taken', label: 'NOT TAKEN',  emoji: '🚫', color: 'border-muted-foreground/50 bg-secondary text-muted-foreground' },
];

// ── Quick mode ────────────────────────────────────────────────────────────────
function QuickCompleteModal({ analysis, onClose, onCompleted }) {
  const [saving, setSaving] = useState(false);
  const [savedRecord, setSavedRecord] = useState(null);
  const [showJournal, setShowJournal] = useState(false);
  const processingRef = useRef(false);

  if (!analysis) return null;
  const { instrument, results } = analysis;

  const handlePick = async (resultValue) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setSaving(true);

    console.log("PB_DEBUG_OUTCOME_CLICKED", {
      outcome: resultValue,
      instrument,
      analysisId: getAnalysisId(analysis),
      timestamp: new Date().toISOString(),
    });

    let record;
    try {
      record = await completeTrade(analysis, resultValue);
    } catch (err) {
      setSaving(false);
      processingRef.current = false;
      toast.error('Failed to save trade. Please try again.');
      return;
    }

    setSavedRecord(record);
    setSaving(false);

    const analysisId = getAnalysisId(analysis);
    const label = RESULTS.find(r => r.value === resultValue)?.label || resultValue;
    toast(`${instrument} — ${label}`, {
      description: 'Saved to Trade History',
      action: {
        label: 'Undo',
        onClick: async () => {
          await undoCompletion(analysisId, record?.id);
          toast.success(`${instrument} restored to Summary`);
        },
      },
      duration: 6000,
    });

    // Close the modal FIRST (removes completeAnalysis from Dashboard state)
    onCompleted();

    // Then show journal flow as a separate overlay
    // We do this by storing the record and letting the parent re-render with journal
    // Since onCompleted closes this modal, show journal via a queued state update
    setSavedRecord(record); // still set so we can hand off if needed
  };

  if (showJournal && savedRecord) {
    return (
      <TradeJournalFlow
        trade={savedRecord}
        onClose={onCompleted}
        onDone={onCompleted}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl overflow-y-auto"
        style={{ marginBottom: 'calc(64px + var(--safe-area-bottom))', maxHeight: 'calc(100vh - 120px)' }}
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

        {/* Snapshot */}
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
                  disabled={saving}
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); handlePick(r.value); }}
                  className={cn(
                    'rounded-xl border-2 py-4 text-sm font-bold transition-all active:scale-95',
                    'border-border bg-secondary text-foreground hover:border-primary/50 hover:bg-primary/5',
                    'disabled:opacity-50 disabled:pointer-events-none'
                  )}
                >
                  <div className="text-2xl mb-1">{r.emoji}</div>
                  <div>{r.label}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Detailed mode ─────────────────────────────────────────────────────────────
function DetailedCompleteModal({ analysis, onClose, onCompleted }) {
  const [result, setResult] = useState('');
  const [entry, setEntry] = useState('');
  const [exit, setExit] = useState('');
  const [pnl, setPnl] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const savedTradeRef = useRef(null);
  const processingRef = useRef(false);

  if (!analysis) return null;
  const { instrument, results } = analysis;

  const handleSave = async () => {
    if (!result) { toast.error('Please select a result'); return; }
    if (processingRef.current) return;
    processingRef.current = true;
    setSaving(true);

    console.log("PB_DEBUG_OUTCOME_CLICKED", {
      outcome: result,
      instrument,
      analysisId: getAnalysisId(analysis),
      timestamp: new Date().toISOString(),
    });

    let record;
    try {
      record = await completeTrade(analysis, result, { entry, exit, pnl, notes });
    } catch (err) {
      setSaving(false);
      processingRef.current = false;
      toast.error('Failed to save trade. Please try again.');
      return;
    }

    savedTradeRef.current = record;
    const analysisId = getAnalysisId(analysis);
    toast.success(`${instrument} saved to Trade History`, {
      action: {
        label: 'Undo',
        onClick: async () => {
          await undoCompletion(analysisId, record?.id);
          toast.success(`${instrument} restored to Summary`);
        },
      },
      duration: 6000,
    });
    setSaving(false);

    // Close Dashboard modal immediately, then show journal flow
    onCompleted();
    setShowJournal(true);
  };

  if (showJournal && savedTradeRef.current) {
    return (
      <TradeJournalFlow
        trade={savedTradeRef.current}
        onClose={onCompleted}
        onDone={onCompleted}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl overflow-y-auto"
        style={{ marginBottom: 'calc(64px + var(--safe-area-bottom))', maxHeight: 'calc(100vh - 120px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div>
            <div className="text-base font-bold">Complete Trade</div>
            <div className="text-xs text-muted-foreground">{instrument}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Snapshot */}
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

          {/* Result picker */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Result *</div>
            <div className="grid grid-cols-2 gap-2">
              {RESULTS.map(r => (
                <button
                  key={r.value}
                  disabled={saving}
                  onClick={() => setResult(r.value)}
                  className={cn(
                    'rounded-xl border-2 p-3 text-sm font-semibold text-left transition-all',
                    result === r.value ? r.color : 'border-border bg-secondary text-muted-foreground hover:border-primary/40'
                  )}
                >
                  {r.emoji} {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Details */}
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

// ── Entry point ───────────────────────────────────────────────────────────────
export default function CompleteTradeModal({ analysis, onClose, onCompleted }) {
  const settings = getSettings();
  if (settings.tradeCompletionMode === 'detailed') {
    return <DetailedCompleteModal analysis={analysis} onClose={onClose} onCompleted={onCompleted} />;
  }
  return <QuickCompleteModal analysis={analysis} onClose={onClose} onCompleted={onCompleted} />;
}