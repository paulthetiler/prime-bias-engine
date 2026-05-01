import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import MonthCard from '@/components/journal/MonthCard';
import JournalForm from '@/components/journal/JournalForm';
import YearSummaryBar from '@/components/journal/YearSummaryBar';

const YEARS = [2024, 2025, 2026];

export default function Journal() {
  const qc = useQueryClient();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  const { data: allEntries = [] } = useQuery({
    queryKey: ['journal'],
    queryFn: () => base44.entities.MonthlyJournal.list('-year', 200),
  });

  const entries = allEntries
    .filter(e => Number(e.year) === Number(selectedYear))
    .sort((a, b) => {
      const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      return MONTHS.indexOf(b.month) - MONTHS.indexOf(a.month);
    });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.MonthlyJournal.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journal'] }); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MonthlyJournal.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journal'] }); setEditingEntry(null); },
  });

  const handleSave = (formData) => {
    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-lg font-bold tracking-tight">Journal</h1>
        <Button size="sm" className="gap-1.5 h-8" onClick={() => { setEditingEntry(null); setShowForm(true); }}>
          <Plus className="w-3.5 h-3.5" /> New Entry
        </Button>
      </div>

      {/* Year selector */}
      <div className="flex gap-2">
        {YEARS.map(y => (
          <button
            key={y}
            onClick={() => setSelectedYear(y)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
              selectedYear === y
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary text-muted-foreground border-border hover:border-primary/50'
            )}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Year summary */}
      {entries.length > 0 && <YearSummaryBar entries={entries} />}

      {/* Month cards */}
      {entries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <div className="text-3xl mb-3">📒</div>
          <p>No entries for {selectedYear}</p>
          <button className="mt-3 text-primary text-xs font-semibold hover:underline" onClick={() => setShowForm(true)}>
            Add your first entry →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map(e => (
            <MonthCard
              key={e.id}
              entry={e}
              onEdit={(entry) => { setEditingEntry(entry); setShowForm(true); }}
            />
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setShowForm(false); setEditingEntry(null); }}>
          <div
            className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl overflow-y-auto"
            style={{ maxHeight: 'calc(100vh - 60px)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl z-10">
              <div className="text-sm font-bold">{editingEntry ? 'Edit Entry' : 'New Monthly Entry'}</div>
              <button onClick={() => { setShowForm(false); setEditingEntry(null); }} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <JournalForm
                initial={editingEntry}
                onSave={handleSave}
                onCancel={() => { setShowForm(false); setEditingEntry(null); }}
                saving={saving}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}