import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ArrowLeftRight, Zap, TrendingUp, TrendingDown, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { interpretation, rankChange, separationLabel, strongerAndWeaker } from '@/lib/strengthContext';

const WINDOWS = [
  { key: '1h', label: '1H' },
  { key: '4h', label: '4H' },
  { key: 'today', label: 'Today' },
];

const STRENGTH_API_VERSION = '4';

function movementLabel(change) {
  if (change == null || change === 0) return { text: '—', className: 'text-muted-foreground' };
  if (change > 0) return { text: `↑${change}`, className: 'text-emerald-600 dark:text-emerald-400' };
  return { text: `↓${Math.abs(change)}`, className: 'text-red-600 dark:text-red-400' };
}

function StrengthBar({ row, maxAbs, change, showInterpretation }) {
  const positive = row.strength >= 0;
  const width = maxAbs > 0 ? Math.max(4, (Math.abs(row.strength) / maxAbs) * 100) : 4;
  const movement = movementLabel(change);
  const read = interpretation(row, change || 0);
  return (
    <div className="py-1.5 border-b border-border/35 last:border-0">
      <div className="grid grid-cols-[42px_1fr_58px_30px] items-center gap-2">
        <span className="text-sm font-bold text-foreground">{row.currency}</span>
        <div className="relative h-7 rounded-md bg-secondary/70 overflow-hidden">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border z-10" />
          <div className={cn('absolute top-1 bottom-1 rounded-sm', positive ? 'left-1/2 bg-emerald-500/75' : 'right-1/2 bg-red-500/70')} style={{ width: `${width / 2}%` }} />
        </div>
        <span className={cn('text-right font-mono text-xs font-bold', positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{positive ? '+' : ''}{row.strength.toFixed(2)}%</span>
        <span className={cn('text-right text-[11px] font-black', movement.className)} title="Rank change versus 4H">{movement.text}</span>
      </div>
      {showInterpretation && <div className="pl-[50px] mt-1 leading-tight"><span className={cn('text-[9px] font-black tracking-wide', read.className)}>{read.state}</span><span className="text-[9px] text-muted-foreground"> · {read.helper}</span></div>}
    </div>
  );
}

export default function Strength() {
  const [windowKey, setWindowKey] = useState('today');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/currency-strength?v=${STRENGTH_API_VERSION}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'Unable to load strength data');
      setData(body);
    } catch (err) { setError(err?.message || 'Unable to load strength data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const snapshot = data?.windows?.[windowKey];
  const strengths = snapshot?.strengths || [];
  const separations = snapshot?.separations || [];
  const referenceStrengths = data?.windows?.['4h']?.strengths || [];
  const todayStrengths = data?.windows?.today?.strengths || [];
  const maxAbs = useMemo(() => strengths.reduce((max, row) => Math.max(max, Math.abs(row.strength)), 0), [strengths]);
  const maxSeparation = separations[0]?.separation || 0;
  const strongest = strengths[0];
  const weakest = strengths[strengths.length - 1];
  const activeLabel = WINDOWS.find((item) => item.key === windowKey)?.label || windowKey;

  const positionChanges = useMemo(() => todayStrengths.map(row => ({ currency: row.currency, change: rankChange(row.currency, todayStrengths, referenceStrengths) || 0 })).sort((a, b) => b.change - a.change), [todayStrengths, referenceStrengths]);
  const biggestClimber = positionChanges.find(row => row.change > 0) || null;
  const biggestFaller = [...positionChanges].reverse().find(row => row.change < 0) || null;
  const marketPicks = useMemo(() => separations.slice(0, 3).map(row => { const { stronger, weaker } = strongerAndWeaker(row); return { ...row, stronger, weaker, label: separationLabel(row.separation, maxSeparation) }; }), [separations, maxSeparation]);

  return (
    <div className="px-3 py-4 space-y-3">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Zap className="w-5 h-5 text-primary" /><h1 className="text-lg font-black tracking-tight">Currency Strength</h1></div><p className="text-xs text-muted-foreground mt-1">8-currency relative basket. Separation suggests movement potential — not trade direction.</p></div><Button variant="outline" size="icon" className="h-9 w-9 shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0" onClick={load} disabled={loading} aria-label="Refresh strength" onBlur={(event) => event.currentTarget.blur()}><RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /></Button></div>
        <div className="grid grid-cols-3 gap-2 mt-4">{WINDOWS.map(item => <button key={item.key} type="button" onClick={() => setWindowKey(item.key)} className={cn('rounded-lg border py-2 text-xs font-bold transition-colors', windowKey === item.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/60 text-muted-foreground border-border')}>{item.label}</button>)}</div>
      </div>
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
      {!error && loading && !data && <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading live strength data…</div>}
      {!error && data && <>
        {strongest && weakest && <div className="grid grid-cols-2 gap-2"><div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Strongest</div><div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{strongest.currency}</div><div className="text-xs font-mono">{strongest.strength >= 0 ? '+' : ''}{strongest.strength.toFixed(2)}%</div></div><div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-right"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Weakest</div><div className="text-xl font-black text-red-600 dark:text-red-400 mt-1">{weakest.currency}</div><div className="text-xs font-mono">{weakest.strength.toFixed(2)}%</div></div></div>}
        {marketPicks.length > 0 && <div className="rounded-xl border border-primary/25 bg-primary/5 p-4"><div className="flex items-center gap-2 mb-1"><Target className="w-4 h-4 text-primary" /><h2 className="text-sm font-bold">Market picks</h2></div><p className="text-[11px] text-muted-foreground mb-3">Top strongest-vs-weakest pairings by separation. Pair selection only — direction still comes from Prime Bias.</p><div className="space-y-2">{marketPicks.map((row, index) => <div key={row.pair} className="rounded-lg border border-border/60 bg-card px-3 py-2.5"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 min-w-0"><span className="text-[10px] text-muted-foreground w-4">{index + 1}</span><span className="text-sm font-black">{row.stronger?.currency} ↔ {row.weaker?.currency}</span></div><span className={cn('text-[9px] font-black tracking-wide', row.label === 'VERY HIGH' ? 'text-primary' : 'text-foreground')}>{row.label}</span></div><div className="flex items-center justify-between mt-1 pl-6 text-[10px]"><span><span className="text-emerald-600 dark:text-emerald-400 font-bold">STRONG {row.stronger?.currency}</span> <span className="text-muted-foreground">vs</span> <span className="text-red-600 dark:text-red-400 font-bold">WEAK {row.weaker?.currency}</span></span><span className="font-mono font-bold text-primary">{row.separation.toFixed(2)}%</span></div></div>)}</div></div>}
        {(biggestClimber || biggestFaller) && <div className="grid grid-cols-2 gap-2"><div className="rounded-xl border border-emerald-500/20 bg-card p-3"><div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"><TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Biggest climb</div><div className="mt-1 text-lg font-black">{biggestClimber?.currency || '—'}</div><div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{biggestClimber ? `↑${biggestClimber.change} places` : 'No climb'}</div></div><div className="rounded-xl border border-red-500/20 bg-card p-3 text-right"><div className="flex items-center justify-end gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Biggest drop <TrendingDown className="w-3.5 h-3.5 text-red-600 dark:text-red-400" /></div><div className="mt-1 text-lg font-black">{biggestFaller?.currency || '—'}</div><div className="text-xs font-bold text-red-600 dark:text-red-400">{biggestFaller ? `↓${Math.abs(biggestFaller.change)} places` : 'No drop'}</div></div><div className="col-span-2 text-center text-[9px] text-muted-foreground -mt-1">Position change: Today rank vs 4H rank</div></div>}
        <div className="rounded-xl border border-border bg-card p-4"><div className="flex items-center justify-between mb-1"><h2 className="text-sm font-bold">Current strength</h2><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{activeLabel}</span></div><div className="text-right text-[9px] text-muted-foreground mb-1">↑↓ rank vs 4H</div><div>{strengths.map(row => <StrengthBar key={row.currency} row={row} maxAbs={maxAbs} change={windowKey === '4h' ? 0 : rankChange(row.currency, strengths, referenceStrengths)} showInterpretation={windowKey !== '4h'} />)}</div></div>
        <div className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-2 mb-1"><ArrowLeftRight className="w-4 h-4 text-primary" /><h2 className="text-sm font-bold">Biggest separations</h2></div><p className="text-[11px] text-muted-foreground mb-3">Poles apart = stronger movement potential, not a direction signal.</p><div className="space-y-2">{separations.slice(0, 8).map((row, index) => <div key={row.pair} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2.5"><div className="flex items-center gap-2"><span className="text-[10px] text-muted-foreground w-4">{index + 1}</span><span className="text-sm font-bold">{row.pair}</span></div><div className="flex items-center gap-2"><span className="text-[9px] font-black tracking-wide text-muted-foreground">{separationLabel(row.separation, maxSeparation)}</span><span className="text-xs font-mono font-bold text-primary">{row.separation.toFixed(2)}%</span></div></div>)}</div></div>
        <div className="text-center text-[10px] text-muted-foreground pb-2">Source: {data.source} · relative basket · {data.cached ? 'cached' : 'fresh'} · {data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
      </>}
    </div>
  );
}
