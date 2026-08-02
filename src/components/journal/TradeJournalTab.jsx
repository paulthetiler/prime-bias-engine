import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { X, BookOpen, ClipboardCheck } from 'lucide-react';
import {
  computeStats, buildEquitySeries, filterByTimeframe, resolveStartingBalance, enrichEntry,
} from '@/lib/journalStats';
import PerformanceSummary from './PerformanceSummary';

const RESULT_COLORS = {
  win: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  loss: 'text-red-400 bg-red-500/10 border-red-500/30',
  breakeven: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  not_taken: 'text-muted-foreground bg-secondary border-border',
};
const RESULT_LABELS = { win: 'Win', loss: 'Loss', breakeven: 'B/E', not_taken: 'Not Taken' };
const GRADE_COLORS = { A: 'text-emerald-400', B: 'text-blue-400', C: 'text-yellow-400', D: 'text-orange-400', F: 'text-red-400' };
const PLAN_LABELS = { followed: '✅ Followed', partial: '🟡 Partial', broke_rules: '❌ Broke Rules', not_taken: '🚫 Not Taken' };
const DIR_LABELS = { BUY: 'Buy', SELL: 'Sell' };

const money = (n) => {
  if (n == null || !Number.isFinite(n)) return null;
  const s = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${s}`;
};
const rLabel = (r) => (r == null ? null : `${r > 0 ? '+' : ''}${r.toFixed(1)}R`);

function JournalEntryDetail({ entry, onClose }) {
  const dirColor = entry.direction === 'BUY' ? 'text-emerald-400' : entry.direction === 'SELL' ? 'text-red-400' : 'text-muted-foreground';
  const pnlStr = money(entry.pnl);
  const r = rLabel(entry.rMultiple);
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl overflow-y-auto"
        style={{ marginBottom: 'calc(64px + var(--safe-area-bottom))', maxHeight: 'calc(100vh - 120px)' }}
        onClick={e => e.stopPropagation()}
      >
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
              <div className={cn('font-bold', dirColor)}>{DIR_LABELS[entry.direction] ?? entry.direction}</div>
              <div className="text-muted-foreground">Side</div>
            </div>
            <div className="bg-secondary rounded-lg p-2">
              <div className={cn('font-bold', GRADE_COLORS[entry.grade])}>{entry.grade}</div>
              <div className="text-muted-foreground">Grade</div>
            </div>
            <div className="bg-secondary rounded-lg p-2">
              <div className={cn('font-bold font-mono', entry.rMultiple > 0 ? 'text-emerald-400' : entry.rMultiple < 0 ? 'text-red-400' : '')}>{r ?? '—'}</div>
              <div className="text-muted-foreground">R</div>
            </div>
          </div>

          {(pnlStr || entry.roi != null) && (
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="bg-secondary rounded-lg p-2.5">
                <div className={cn('font-bold font-mono text-sm', entry.pnl > 0 ? 'text-emerald-400' : entry.pnl < 0 ? 'text-red-400' : '')}>{pnlStr ?? '—'}</div>
                <div className="text-muted-foreground">Profit / Loss</div>
              </div>
              <div className="bg-secondary rounded-lg p-2.5">
                <div className={cn('font-bold font-mono text-sm', entry.roi > 0 ? 'text-emerald-400' : entry.roi < 0 ? 'text-red-400' : '')}>
                  {entry.roi == null ? '—' : `${entry.roi > 0 ? '+' : ''}${entry.roi}%`}
                </div>
                <div className="text-muted-foreground">ROI</div>
              </div>
            </div>
          )}

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

/** A single, information-dense journal entry card. */
function EntryCard({ entry, index, onSelect }) {
  const pnlStr = money(entry.pnl);
  const r = rLabel(entry.rMultiple);
  const note = entry.lesson || entry.what_happened;
  const followed = entry.followed_plan === 'followed';

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.02, 0.2) }}
      onClick={() => onSelect(entry)}
      className="w-full rounded-2xl border border-border bg-card p-3.5 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-accent/40"
    >
      <div className="flex items-start gap-3">
        <div className={cn('shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold', RESULT_COLORS[entry.result])}>
          {RESULT_LABELS[entry.result] || '—'}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{entry.instrument}</span>
            {entry.grade && <span className={cn('text-xs font-bold', GRADE_COLORS[entry.grade])}>{entry.grade}</span>}
            {entry.direction && (
              <span className={cn('text-xs font-semibold', entry.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400')}>
                {DIR_LABELS[entry.direction] ?? entry.direction}
              </span>
            )}
          </div>

          {/* Meta chips: plan + R multiple */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {entry.followed_plan && (
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                followed ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-border bg-secondary text-muted-foreground'
              )}>
                <ClipboardCheck className="h-2.5 w-2.5" />
                {PLAN_LABELS[entry.followed_plan]?.replace(/^\S+\s/, '') ?? 'Plan'}
              </span>
            )}
            {r && (
              <span className={cn(
                'rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold',
                entry.rMultiple > 0 ? 'bg-emerald-500/10 text-emerald-500' : entry.rMultiple < 0 ? 'bg-red-500/10 text-red-500' : 'bg-secondary text-muted-foreground'
              )}>
                {r}
              </span>
            )}
          </div>

          {note && <p className="mt-1 truncate text-[11px] text-muted-foreground">{note}</p>}
        </div>

        {/* Right rail: P/L, ROI, date */}
        <div className="shrink-0 text-right">
          {pnlStr != null ? (
            <div className={cn('font-mono text-sm font-bold tabular-nums', entry.pnl > 0 ? 'text-emerald-500' : entry.pnl < 0 ? 'text-red-500' : 'text-muted-foreground')}>
              {pnlStr}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">—</div>
          )}
          {entry.roi != null && (
            <div className={cn('font-mono text-[10px] tabular-nums', entry.roi > 0 ? 'text-emerald-500/80' : entry.roi < 0 ? 'text-red-500/80' : 'text-muted-foreground')}>
              {entry.roi > 0 ? '+' : ''}{entry.roi}%
            </div>
          )}
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {entry.created_at ? format(new Date(entry.created_at), 'dd MMM') : ''}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

export default function TradeJournalTab() {
  const [selected, setSelected] = useState(null);
  const [timeframe, setTimeframe] = useState('all');

  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ['journalEntries'],
    queryFn: () => base44.entities.TradeJournalEntry.list('-created_at', 200),
  });

  // Completed trades carry the P&L the journal entries don't; monthly journals
  // give us a real starting balance for ROI / account-balance views.
  const { data: trades = [], isLoading: tradesLoading } = useQuery({
    queryKey: ['completedTrades'],
    queryFn: () => base44.entities.CompletedTrade.filter({ status: 'completed' }, '-completed_at', 200),
  });
  const { data: monthly = [] } = useQuery({
    queryKey: ['journal'],
    queryFn: () => base44.entities.MonthlyJournal.list('-year', 200),
  });

  const { value: startingBalance, source: balanceSource } = useMemo(
    () => resolveStartingBalance(monthly),
    [monthly]
  );

  const tradesById = useMemo(() => new Map(trades.map(t => [t.id, t])), [trades]);

  // The selected window drives the dashboard AND the entry list together.
  const windowTrades = useMemo(() => filterByTimeframe(trades, timeframe), [trades, timeframe]);
  const windowEntries = useMemo(() => filterByTimeframe(entries, timeframe), [entries, timeframe]);

  const stats = useMemo(() => computeStats(windowTrades, { startingBalance }), [windowTrades, startingBalance]);
  const series = useMemo(() => buildEquitySeries(windowTrades, { startingBalance }), [windowTrades, startingBalance]);
  const enriched = useMemo(
    () => windowEntries.map(e => enrichEntry(e, tradesById, { startingBalance })),
    [windowEntries, tradesById, startingBalance]
  );

  const isLoading = entriesLoading || tradesLoading;

  if (isLoading) {
    return (
      <div className="space-y-3 pt-2">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[...Array(8)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-secondary animate-pulse" />)}
        </div>
        <div className="h-48 rounded-2xl bg-secondary animate-pulse" />
      </div>
    );
  }

  // Nothing recorded at all — keep the original invitation.
  if (entries.length === 0 && trades.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p>No journal entries yet.</p>
        <p className="text-xs mt-1">Complete a trade and tap "Journal this trade"</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <PerformanceSummary
        stats={stats}
        series={series}
        timeframe={timeframe}
        onTimeframe={setTimeframe}
        startingBalance={startingBalance}
        balanceSource={balanceSource}
      />

      {/* Journal entries */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Journal Entries</h2>
          {enriched.length > 0 && <span className="text-[11px] text-muted-foreground">{enriched.length}</span>}
        </div>

        {enriched.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
            {entries.length === 0
              ? 'Journal a completed trade to start reflecting on your process.'
              : 'No journal entries in this time range.'}
          </div>
        ) : (
          enriched.map((entry, i) => (
            <EntryCard key={entry.id} entry={entry} index={i} onSelect={setSelected} />
          ))
        )}
      </div>

      {selected && <JournalEntryDetail entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
