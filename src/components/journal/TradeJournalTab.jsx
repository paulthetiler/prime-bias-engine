import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { X, BookOpen } from 'lucide-react';

const RESULT_COLORS = {
  win: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  loss: 'text-red-400 bg-red-500/10 border-red-500/30',
  breakeven: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  not_taken: 'text-muted-foreground bg-secondary border-border',
};
const RESULT_LABELS = { win: 'Win', loss: 'Loss', breakeven: 'B/E', not_taken: 'Not Taken' };
const GRADE_COLORS = { A: 'text-emerald-400', B: 'text-blue-400', C: 'text-yellow-400', D: 'text-orange-400', F: 'text-red-400' };
const PLAN_LABELS = { followed: '✅ Followed', partial: '🟡 Partial', broke_rules: '❌ Broke Rules', not_taken: '🚫 Not Taken' };

function JournalEntryDetail({ entry, onClose }) {
  const dirColor = entry.direction === 'BUY' ? 'text-emerald-400' : entry.direction === 'SELL' ? 'text-red-400' : 'text-muted-foreground';
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div>
            <div className="text-base font-bold">{entry.instrument}</div>
            <div className="text-xs text-muted-foreground">{entry.created_at ? format(new Date(entry.created_at), 'dd MMM yyyy HH:mm') : '—'}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          {/* Header stats */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="bg-secondary rounded-lg p-2">
              <div className={cn('font-bold', RESULT_COLORS[entry.result]?.split(' ')[0])}>{RESULT_LABELS[entry.result]}</div>
              <div className="text-muted-foreground">Result</div>
            </div>
            <div className="bg-secondary rounded-lg p-2">
              <div className={cn('font-bold', GRADE_COLORS[entry.grade])}>{entry.grade}</div>
              <div className="text-muted-foreground">Grade</div>
            </div>
            <div className="bg-secondary rounded-lg p-2">
              <div className={cn('font-bold', dirColor)}>{entry.direction}</div>
              <div className="text-muted-foreground">Dir</div>
            </div>
            <div className="bg-secondary rounded-lg p-2">
              <div className="font-bold font-mono">{entry.score}</div>
              <div className="text-muted-foreground">Score</div>
            </div>
          </div>

          {entry.followed_plan && (
            <div className="rounded-xl bg-secondary/40 border border-border px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Followed Plan</div>
              <div className="text-sm font-semibold">{PLAN_LABELS[entry.followed_plan]}</div>
            </div>
          )}

          {entry.what_happened && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">What Happened</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{entry.what_happened}</p>
            </div>
          )}

          {entry.mistake_tags?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Execution Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {entry.mistake_tags.map(t => (
                  <span key={t} className="px-2 py-1 rounded-full text-xs bg-secondary border border-border text-muted-foreground">{t}</span>
                ))}
              </div>
            </div>
          )}

          {entry.lesson_tags?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Lesson Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {entry.lesson_tags.map(t => (
                  <span key={t} className="px-2 py-1 rounded-full text-xs bg-primary/10 border border-primary/30 text-primary">{t}</span>
                ))}
              </div>
            </div>
          )}

          {entry.lesson && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Lesson</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{entry.lesson}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TradeJournalTab() {
  const [selected, setSelected] = useState(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['journalEntries'],
    queryFn: () => base44.entities.TradeJournalEntry.list('-created_at', 200),
  });

  if (isLoading) {
    return <div className="space-y-2 pt-2">{[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-secondary animate-pulse" />)}</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p>No journal entries yet.</p>
        <p className="text-xs mt-1">Complete a trade and tap "Journal this trade"</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-2">
      {entries.map(entry => (
        <button
          key={entry.id}
          onClick={() => setSelected(entry)}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:bg-accent/50 transition-colors text-left"
        >
          <div className={cn('px-2.5 py-1 rounded-lg border text-xs font-bold shrink-0', RESULT_COLORS[entry.result])}>
            {RESULT_LABELS[entry.result] || '—'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{entry.instrument}</span>
              <span className={cn('text-xs font-bold', GRADE_COLORS[entry.grade])}>{entry.grade}</span>
              <span className={cn('text-xs font-semibold', entry.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400')}>{entry.direction}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {entry.followed_plan && (
                <span className="text-[10px] text-muted-foreground">{PLAN_LABELS[entry.followed_plan]}</span>
              )}
              {entry.mistake_tags?.slice(0, 2).map(t => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">{t}</span>
              ))}
            </div>
            {entry.lesson && (
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{entry.lesson}</p>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground shrink-0 text-right">
            {entry.created_at ? format(new Date(entry.created_at), 'dd MMM') : ''}
          </div>
        </button>
      ))}

      {selected && <JournalEntryDetail entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}