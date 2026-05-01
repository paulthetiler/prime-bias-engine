import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, BookOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const RESULT_LABELS = {
  win: '✅ WIN',
  loss: '❌ LOSS',
  breakeven: '➖ BREAK EVEN',
  not_taken: '🚫 NOT TAKEN',
};

function buildTradeNote(analysis, result) {
  const { instrument, results, targetInfo } = analysis;
  if (!results) return '';
  const { mainDirection, grade, status, deepTrend, deepStrength, ddBias, ddStrength, nowBias, nowStrength, winningScore } = results;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const target = targetInfo?.target ? targetInfo.target.toFixed(4) : '—';
  const resultLine = result ? `Result: ${RESULT_LABELS[result] || result}` : '';

  return [
    `📍 ${instrument} — ${dateStr}`,
    resultLine,
    `Direction: ${mainDirection} | Grade: ${grade} (${status}) | Score: ${winningScore}`,
    `Target: ${target}`,
    `Deep: ${deepTrend} (${deepStrength}) | DD: ${ddBias} (${ddStrength}) | Now: ${nowBias} (${nowStrength})`,
    ``,
    `Notes: `,
  ].filter(Boolean).join('\n');
}

export default function TradeJournalModal({ analysis, result, onClose }) {
  const qc = useQueryClient();
  const now = new Date();
  const currentMonth = MONTHS[now.getMonth()];
  const currentYear = now.getFullYear();

  const [note, setNote] = useState(buildTradeNote(analysis, result));
  const [saving, setSaving] = useState(false);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['journal'],
    queryFn: () => base44.entities.MonthlyJournal.list('-year', 200),
  });

  const existingEntry = entries.find(e => e.month === currentMonth && e.year === currentYear);

  const handleSave = async () => {
    setSaving(true);
    const appendedNotes = existingEntry?.notes
      ? `${existingEntry.notes}\n\n---\n\n${note}`
      : note;

    if (existingEntry) {
      await base44.entities.MonthlyJournal.update(existingEntry.id, { notes: appendedNotes });
    } else {
      await base44.entities.MonthlyJournal.create({
        month: currentMonth,
        year: currentYear,
        notes: appendedNotes,
      });
    }

    qc.invalidateQueries({ queryKey: ['journal'] });
    toast.success(`Added to ${currentMonth} journal`);
    setSaving(false);
    onClose();
  };

  const { instrument, results } = analysis;
  const dirColor = results?.mainDirection === 'BUY'
    ? 'text-emerald-600 dark:text-emerald-400'
    : results?.mainDirection === 'SELL'
    ? 'text-red-600 dark:text-red-400'
    : 'text-muted-foreground';

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl"
        style={{ maxHeight: 'calc(100vh - 60px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <div>
              <div className="text-sm font-bold">Journal Trade</div>
              <div className="text-xs text-muted-foreground">{currentMonth} {currentYear}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Trade snapshot */}
          <div className="rounded-xl bg-secondary/50 border border-border px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="font-bold text-sm text-foreground">{instrument}</span>
            <span className={cn('font-bold', dirColor)}>{results?.mainDirection}</span>
            <span className="text-muted-foreground">Grade <span className="text-foreground font-semibold">{results?.grade}</span></span>
            <span className="text-muted-foreground">Score <span className="font-mono text-foreground font-semibold">{results?.winningScore}</span></span>
            {result && <span className="font-semibold text-foreground">{RESULT_LABELS[result]}</span>}
          </div>

          {/* Note editor */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-1.5">
              Entry — edit or add your notes below
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={9}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {existingEntry && (
            <p className="text-xs text-muted-foreground">
              ↳ Will be appended to your existing <span className="font-semibold">{currentMonth}</span> entry.
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 gap-2" onClick={handleSave} disabled={saving || isLoading}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
              {saving ? 'Saving…' : existingEntry ? 'Append to Journal' : 'Create Journal Entry'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}