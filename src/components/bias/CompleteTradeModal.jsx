import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { X, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { calcAlignment } from '@/lib/alignmentUtils';
import { toast } from 'sonner';

const RESULTS = [
  { value: 'win',       label: '✅ Win',                  color: 'border-emerald-500 bg-emerald-500/10 text-emerald-400' },
  { value: 'loss',      label: '❌ Loss',                  color: 'border-red-500 bg-red-500/10 text-red-400' },
  { value: 'breakeven', label: '➖ Break Even',            color: 'border-yellow-500 bg-yellow-500/10 text-yellow-400' },
  { value: 'not_taken', label: '🚫 Not Taken / Invalidated', color: 'border-muted-foreground bg-secondary text-muted-foreground' },
];

export default function CompleteTradeModal({ analysis, onClose, onCompleted }) {
  const [result, setResult] = useState('');
  const [entry, setEntry] = useState('');
  const [exit, setExit] = useState('');
  const [pnl, setPnl] = useState('');
  const [exitReason, setExitReason] = useState('');
  const [notes, setNotes] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [saving, setSaving] = useState(false);

  if (!analysis) return null;
  const { instrument, results, targetInfo, inputs, extraCheck, timestamp } = analysis;

  const handleSave = async () => {
    if (!result) { toast.error('Please select a result'); return; }
    setSaving(true);

    const alignment = calcAlignment(results);

    await base44.entities.CompletedTrade.create({
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

    toast.success(`${instrument} saved to Trade History`);
    setSaving(false);
    onCompleted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div>
            <div className="text-base font-bold">Complete Trade</div>
            <div className="text-xs text-muted-foreground">{instrument}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Setup snapshot */}
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

          {/* Result selector */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Result *</div>
            <div className="grid grid-cols-2 gap-2">
              {RESULTS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setResult(r.value)}
                  className={cn(
                    'rounded-xl border-2 p-3 text-sm font-semibold text-left transition-all',
                    result === r.value ? r.color : 'border-border bg-secondary text-muted-foreground hover:border-primary/40'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Optional fields */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Trade Details (optional)</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Entry Price</label>
                <input
                  type="number" step="any" value={entry} onChange={e => setEntry(e.target.value)}
                  placeholder="e.g. 1.2500"
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Exit Price</label>
                <input
                  type="number" step="any" value={exit} onChange={e => setExit(e.target.value)}
                  placeholder="e.g. 1.2600"
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">P&L</label>
              <input
                type="number" step="any" value={pnl} onChange={e => setPnl(e.target.value)}
                placeholder="e.g. +50 or -25"
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Reason for Exit</label>
              <input
                type="text" value={exitReason} onChange={e => setExitReason(e.target.value)}
                placeholder="e.g. TP hit, SL hit, invalidated..."
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Notes</label>
              <textarea
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="What happened? What did you learn?"
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Screenshot URL</label>
              <input
                type="text" value={screenshotUrl} onChange={e => setScreenshotUrl(e.target.value)}
                placeholder="https://..."
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 gap-2" onClick={handleSave} disabled={saving || !result}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save to History
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}