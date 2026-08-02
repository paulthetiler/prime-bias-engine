import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';

// The three ways to read the same cumulative series (see buildEquitySeries).
const MODES = [
  { id: 'equity', label: 'Equity', key: 'equity', prefix: '', suffix: '' },
  { id: 'roi', label: 'ROI %', key: 'roi', prefix: '', suffix: '%' },
  { id: 'balance', label: 'Balance', key: 'balance', prefix: '', suffix: '' },
];

const UP = '#10b981';
const DOWN = '#ef4444';

function fmtNumber(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Cumulative account-growth chart with Equity / ROI% / Balance views.
 * @param {{ series: any[], hasPnl: boolean, startingBalance: number, balanceSource?: 'journal'|'default' }} props
 */
export default function EquityCurve({ series, hasPnl, startingBalance, balanceSource }) {
  const [mode, setMode] = useState('equity');
  const active = MODES.find(m => m.id === mode) ?? MODES[0];

  // Baseline the chart references: 0 for equity/roi, the starting balance for
  // the balance view. Colour the curve by whether we finished above baseline.
  const baseline = mode === 'balance' ? startingBalance : 0;
  const last = series.length ? series[series.length - 1][active.key] : baseline;
  const up = last >= baseline;
  const color = up ? UP : DOWN;

  const headline = (() => {
    if (!series.length) return '—';
    const sign = mode !== 'balance' && last > 0 ? '+' : '';
    return `${sign}${fmtNumber(last)}${active.suffix}`;
  })();

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {active.label === 'ROI %' ? 'Return on Investment' : active.label === 'Balance' ? 'Account Balance' : 'Equity Curve'}
          </div>
          {hasPnl && series.length > 0 && (
            <div className={cn('mt-0.5 font-mono text-xl font-bold tabular-nums', up ? 'text-emerald-500' : 'text-red-500')}>
              {headline}
            </div>
          )}
        </div>

        {/* Mode switch */}
        <div className="flex shrink-0 gap-0.5 rounded-lg bg-secondary p-0.5">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
                mode === m.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {hasPnl && series.length > 1 ? (
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={series} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
            <defs>
              <linearGradient id={`eqFill-${mode}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" opacity={0.4} vertical={false} />
            <XAxis
              dataKey="i"
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-muted-foreground"
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-muted-foreground"
              tickLine={false}
              axisLine={false}
              width={46}
              tickFormatter={(v) => `${active.suffix === '%' ? v : fmtNumber(v)}${active.suffix}`}
            />
            <ReferenceLine y={baseline} stroke="currentColor" className="text-muted-foreground" strokeDasharray="4 4" opacity={0.5} />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 }}
              labelFormatter={(i) => {
                const p = series[i - 1];
                if (!p) return `Trade ${i}`;
                const d = p.date ? format(new Date(p.date), 'dd MMM HH:mm') : `Trade ${i}`;
                return p.instrument ? `${p.instrument} · ${d}` : d;
              }}
              formatter={(v) => [`${active.prefix}${fmtNumber(v)}${active.suffix}`, active.label]}
            />
            <Area type="monotone" dataKey={active.key} stroke={color} strokeWidth={2.5} fill={`url(#eqFill-${mode})`} animationDuration={500} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[190px] flex-col items-center justify-center text-center text-xs text-muted-foreground">
          <p>{hasPnl ? 'Log at least two priced trades to plot your curve.' : 'Add P&L when completing trades to grow your equity curve.'}</p>
        </div>
      )}

      {mode !== 'equity' && balanceSource === 'default' && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Based on a {fmtNumber(startingBalance)} starting balance. Set a monthly start balance in the Journal to personalise this.
        </p>
      )}
    </div>
  );
}
