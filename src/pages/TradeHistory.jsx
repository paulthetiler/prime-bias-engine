import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Trash2, RotateCcw, SlidersHorizontal, X, ExternalLink, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import TradeJournalFlow from '@/components/journal/TradeJournalFlow';

const resultColors = {
  win:       'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  loss:      'text-red-400 bg-red-500/10 border-red-500/30',
  breakeven: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  not_taken: 'text-muted-foreground bg-secondary border-border',
};
const resultLabels = { win: 'Win', loss: 'Loss', breakeven: 'B/E', not_taken: 'Not Taken' };

const gradeColors = {
  A: 'text-emerald-400', B: 'text-blue-400', C: 'text-yellow-400',
  D: 'text-orange-400',  F: 'text-red-400',
};

function StatBox({ label, value, valueClass }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 text-center">
      <div className={cn('text-xl font-bold', valueClass)}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function Analytics({ trades }) {
  const completed = trades.filter(t => t.result);
  const wins = completed.filter(t => t.result === 'win').length;
  const losses = completed.filter(t => t.result === 'loss').length;
  const bes = completed.filter(t => t.result === 'breakeven').length;
  const winRate = completed.length > 0 ? Math.round((wins / completed.length) * 100) : 0;

  const gradeCounts = {};
  completed.forEach(t => { if (t.grade) gradeCounts[t.grade] = (gradeCounts[t.grade] || 0) + 1; });
  const bestGrade = Object.entries(gradeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  const assetWins = {};
  const assetTotal = {};
  completed.forEach(t => {
    assetTotal[t.instrument] = (assetTotal[t.instrument] || 0) + 1;
    if (t.result === 'win') assetWins[t.instrument] = (assetWins[t.instrument] || 0) + 1;
  });
  const assets = Object.keys(assetTotal);
  const bestAsset = assets.sort((a, b) => (assetWins[b] || 0) / assetTotal[b] - (assetWins[a] || 0) / assetTotal[a])[0] || '—';
  const worstAsset = assets.sort((a, b) => (assetWins[a] || 0) / assetTotal[a] - (assetWins[b] || 0) / assetTotal[b])[0] || '—';

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Analytics</div>
      <div className="grid grid-cols-4 gap-2">
        <StatBox label="Total" value={completed.length} />
        <StatBox label="Wins" value={wins} valueClass="text-emerald-400" />
        <StatBox label="Losses" value={losses} valueClass="text-red-400" />
        <StatBox label="B/E" value={bes} valueClass="text-yellow-400" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Win Rate" value={`${winRate}%`} valueClass={winRate >= 50 ? 'text-emerald-400' : 'text-red-400'} />
        <StatBox label="Best Grade" value={bestGrade} valueClass={gradeColors[bestGrade]} />
        <StatBox label="Best Asset" value={bestAsset} valueClass="text-primary" />
      </div>
      {worstAsset !== bestAsset && worstAsset !== '—' && (
        <div className="grid grid-cols-1">
          <StatBox label="Needs Work" value={worstAsset} valueClass="text-orange-400" />
        </div>
      )}
    </div>
  );
}

function TradeDetailModal({ trade, onClose, onRestore, onArchive, onDelete }) {
  if (!trade) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
              { label: 'Direction', value: trade.direction, cls: trade.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Grade', value: trade.grade, cls: gradeColors[trade.grade] },
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

          {/* Trade execution */}
          {(trade.entry_price || trade.exit_price || trade.pnl) && (
            <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Execution</div>
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                {trade.entry_price && <div><div className="font-mono font-bold">{trade.entry_price}</div><div className="text-muted-foreground">Entry</div></div>}
                {trade.exit_price  && <div><div className="font-mono font-bold">{trade.exit_price}</div><div className="text-muted-foreground">Exit</div></div>}
                {trade.pnl != null && <div><div className={cn('font-mono font-bold', trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>{trade.pnl > 0 ? '+' : ''}{trade.pnl}</div><div className="text-muted-foreground">P&L</div></div>}
              </div>
            </div>
          )}

          {trade.exit_reason && (
            <div><div className="text-xs text-muted-foreground mb-1">Exit Reason</div><p className="text-sm">{trade.exit_reason}</p></div>
          )}
          {trade.notes && (
            <div><div className="text-xs text-muted-foreground mb-1">Notes</div><p className="text-sm text-muted-foreground">{trade.notes}</p></div>
          )}
          {trade.screenshot_url && (
            <a href={trade.screenshot_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-primary hover:underline">
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

const ALL_RESULTS = ['win', 'loss', 'breakeven', 'not_taken'];
const ALL_GRADES  = ['A', 'B', 'C', 'D', 'F'];

export default function TradeHistory() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [journalingTrade, setJournalingTrade] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ result: '', grade: '', direction: '', asset: '' });

  const { data: trades = [], isLoading } = useQuery({
    queryKey: ['completedTrades'],
    queryFn: () => base44.entities.CompletedTrade.filter({ status: 'completed' }, '-completed_at', 200),
  });

  const { data: journalEntries = [] } = useQuery({
    queryKey: ['journalEntries'],
    queryFn: () => base44.entities.TradeJournalEntry.list('-created_at', 500),
  });

  const journaledIds = new Set(journalEntries.map(e => e.completed_trade_id).filter(Boolean));

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CompletedTrade.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['completedTrades'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CompletedTrade.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['completedTrades'] }),
  });

  const handleRestore = async (trade) => {
    // Put back into active localStorage
    const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
    active[trade.instrument] = {
      instrument: trade.instrument,
      inputs: trade.inputs_snapshot || {},
      timestamp: trade.created_at,
      extraCheck: { h1: trade.extra_check_h1 ?? null, m15: trade.extra_check_m15 ?? null },
    };
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

  const handleDelete = async (trade) => {
    await deleteMutation.mutateAsync(trade.id);
    setSelected(null);
    toast.success('Trade deleted');
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

      {/* Analytics */}
      {trades.length > 0 && <Analytics trades={trades} />}

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
                  <span className={cn('text-xs font-bold', gradeColors[trade.grade])}>{trade.grade}</span>
                  <span className={cn('text-xs font-semibold', trade.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400')}>{trade.direction}</span>
                  {journaledIds.has(trade.id) ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary font-semibold">Journaled</span>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); setJournalingTrade(trade); }}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors flex items-center gap-1"
                    >
                      <BookOpen className="w-2.5 h-2.5" /> Add Journal
                    </button>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {trade.completed_at ? format(new Date(trade.completed_at), 'dd MMM yyyy HH:mm') : '—'}
                  {trade.pnl != null && (
                    <span className={cn('ml-2 font-semibold', trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {trade.pnl > 0 ? '+' : ''}{trade.pnl}
                    </span>
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
        />
      )}

      {journalingTrade && (
        <TradeJournalFlow
          trade={journalingTrade}
          onClose={() => setJournalingTrade(null)}
          onDone={() => setJournalingTrade(null)}
        />
      )}
    </div>
  );
}