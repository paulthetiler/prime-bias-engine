import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Plus, X, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import TradeJournalTab from '@/components/journal/TradeJournalTab';
import MonthCard from '@/components/journal/MonthCard';
import YearSummaryBar from '@/components/journal/YearSummaryBar';
import JournalForm from '@/components/journal/JournalForm';

const MONTH_ORDER = {
  January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
  July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
};

function MonthlyJournal() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // entry being edited, or {} for new

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['journal'],
    queryFn: () => base44.entities.MonthlyJournal.list('-year', 200),
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, data }) =>
      id
        ? base44.entities.MonthlyJournal.update(id, data)
        : base44.entities.MonthlyJournal.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journal'] });
      setEditing(null);
      toast.success('Journal saved');
    },
    onError: () => toast.error('Failed to save journal'),
  });

  // Sort newest year first, then latest month first.
  const sorted = [...entries].sort((a, b) => {
    const yearDiff = Number(b.year) - Number(a.year);
    if (yearDiff !== 0) return yearDiff;
    return (MONTH_ORDER[b.month] ?? 0) - (MONTH_ORDER[a.month] ?? 0);
  });

  // Year summary uses the most recent year's entries in chronological order.
  const latestYear = sorted[0]?.year;
  const yearEntries = sorted
    .filter(e => e.year === latestYear)
    .sort((a, b) => (MONTH_ORDER[a.month] ?? 0) - (MONTH_ORDER[b.month] ?? 0));

  if (editing) {
    return (
      <div className="pt-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold">{editing.id ? 'Edit Entry' : 'New Monthly Entry'}</h2>
          <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-secondary">
            <X className="w-4 h-4" />
          </button>
        </div>
        <JournalForm
          initial={editing.id ? editing : null}
          saving={saveMutation.isPending}
          onCancel={() => setEditing(null)}
          onSave={(data) => saveMutation.mutate({ id: editing.id, data })}
        />
      </div>
    );
  }

  if (isLoading) {
    return <div className="space-y-2 pt-2">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-secondary animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-3 pt-2">
      <Button className="w-full gap-2" onClick={() => setEditing({})}>
        <Plus className="w-4 h-4" /> Add Monthly Entry
      </Button>

      {entries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>No monthly journals yet.</p>
          <p className="text-xs mt-1">Track balance, P&amp;L, goals and rules per month.</p>
        </div>
      ) : (
        <>
          <YearSummaryBar entries={yearEntries} />
          <div className="space-y-2">
            {sorted.map(entry => (
              <MonthCard key={entry.id} entry={entry} onEdit={setEditing} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Journal() {
  const [tab, setTab] = useState('trades'); // 'trades' | 'monthly'

  return (
    <div className="p-4 space-y-3 pb-24">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-lg font-bold tracking-tight">Journal</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 rounded-lg bg-secondary p-1">
        {[
          { id: 'trades', label: 'Trade Journal' },
          { id: 'monthly', label: 'Monthly' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 rounded-md py-1.5 text-sm font-semibold transition-colors',
              tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'trades' ? <TradeJournalTab /> : <MonthlyJournal />}
    </div>
  );
}
