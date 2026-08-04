import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { sortBreakdownRows } from '@/lib/performance';

// A reusable engine-quality / behaviour breakdown. It is PURELY presentational —
// it renders rows already summarised by lib/performance.breakdown()/…ByReasonTags
// and never computes metrics itself. Mobile-first: each row is a tappable card
// that expands to the full metric set; small samples are muted and flagged.

const SORTS = [
  { id: 'default', label: 'Best sample' },
  { id: 'netPnl', label: 'Net P&L' },
  { id: 'expectancy', label: 'Expectancy' },
  { id: 'winRate', label: 'Win rate' },
  { id: 'avgR', label: 'Avg R' },
  { id: 'sample', label: 'Trade count' },
];

const SAMPLE_BADGE = {
  usable: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  early: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
  insufficient: 'bg-muted text-muted-foreground border-border',
};
const SAMPLE_LABEL = { usable: 'usable', early: 'early', insufficient: 'low sample' };

const pct = (f) => (f == null || !Number.isFinite(f) ? '—' : `${Math.round(f * 100)}%`);
const money = (n, cur) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}${cur ? cur + ' ' : ''}${s}`;
};
const r2 = (n) => (n == null || !Number.isFinite(n) ? '—' : (n === Infinity ? '∞' : n.toFixed(2)));

function Cell({ label, value, tone = '' }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('font-mono text-xs font-semibold', tone)}>{value}</div>
    </div>
  );
}

function Row({ row, currency, monetaryEnabled }) {
  const [open, setOpen] = useState(false);
  const muted = row.sampleStatus === 'insufficient';
  const netTone = row.netPnl == null ? 'text-foreground' : row.netPnl > 0 ? 'text-emerald-500' : row.netPnl < 0 ? 'text-red-500' : 'text-foreground';
  return (
    <div className={cn('border-b border-border/40 last:border-0', muted && 'opacity-60')}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/40 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{row.label}</span>
            <span className={cn('shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold', SAMPLE_BADGE[row.sampleStatus])}>
              {SAMPLE_LABEL[row.sampleStatus]}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {row.directionalCount} dir · {pct(row.winRate)} WR{monetaryEnabled ? ` · ${money(row.netPnl, currency)}` : ''}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="grid grid-cols-3 gap-x-3 gap-y-2 px-3 pb-3 pt-1 sm:grid-cols-4">
          <Cell label="Trades" value={row.totalTrades} />
          <Cell label="Complete" value={row.completeCount} />
          <Cell label="W/L/BE" value={`${row.wins}/${row.losses}/${row.breakevens}`} />
          <Cell label="Outcome WR" value={pct(row.winRate)} />
          <Cell label="Money WR" value={pct(row.moneyWinRate)} />
          <Cell label="Net P&L" value={monetaryEnabled ? money(row.netPnl, currency) : '—'} tone={monetaryEnabled ? netTone : undefined} />
          <Cell label="Expectancy" value={monetaryEnabled ? money(row.expectancy, currency) : '—'} />
          <Cell label="Avg R" value={row.avgR == null ? '—' : `${row.avgR.toFixed(2)}R`} />
          <Cell label="Profit factor" value={r2(row.profitFactor)} />
          <Cell label="Sample" value={SAMPLE_LABEL[row.sampleStatus]} />
        </div>
      )}
    </div>
  );
}

/**
 * @param {{
 *   title: string, subtitle?: string, rows: any[], currency?: string|null,
 *   monetaryEnabled?: boolean, defaultSort?: string,
 * }} props
 */
export default function BreakdownGroup({ title, subtitle, rows = [], currency, monetaryEnabled = true, defaultSort = 'default' }) {
  const [sort, setSort] = useState(defaultSort);
  const sorted = useMemo(() => sortBreakdownRows(rows, sort), [rows, sort]);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-2 px-3 py-2.5 border-b border-border">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</div>
          {subtitle && <div className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</div>}
        </div>
        {rows.length > 1 && (
          <select
            aria-label={`Sort ${title}`}
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="shrink-0 h-7 rounded-md border border-input bg-background px-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}
      </div>
      {sorted.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">No data in this scope.</div>
      ) : (
        <div>{sorted.map(row => <Row key={row.key} row={row} currency={currency} monetaryEnabled={monetaryEnabled} />)}</div>
      )}
    </div>
  );
}
