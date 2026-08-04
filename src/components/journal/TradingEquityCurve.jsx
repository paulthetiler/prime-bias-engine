import React from 'react';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';

// Trading-equity curve: opening balance + cumulative trade net P&L only. It
// deliberately EXCLUDES deposits, withdrawals and wage withdrawals, so it shows
// trading performance — not cash movement. The values come from
// lib/performance.tradingEquityCurve(); this component only renders them.

const UP = '#10b981';
const DOWN = '#ef4444';
const fmt = (n) => (n == null || !Number.isFinite(n) ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 2 }));

/**
 * @param {{ values: number[], currency?: string|null }} props  values[0] is the
 *   opening balance; each later point is opening + cumulative net P&L.
 */
export default function TradingEquityCurve({ values = [], currency }) {
  const cur = currency ? `${currency} ` : '';
  const data = values.map((v, i) => ({ i, equity: v }));
  const opening = values.length ? values[0] : 0;
  const last = values.length ? values[values.length - 1] : opening;
  const up = last >= opening;
  const color = up ? UP : DOWN;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Trading equity</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">Opening balance + cumulative trade P&L · excludes deposits, withdrawals and wages.</div>
        {values.length > 1 && (
          <div className={cn('mt-1 font-mono text-xl font-bold tabular-nums', up ? 'text-emerald-500' : 'text-red-500')}>
            {cur}{fmt(last)}
          </div>
        )}
      </div>
      {values.length > 1 ? (
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={data} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
            <defs>
              <linearGradient id="tradeEqFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" opacity={0.4} vertical={false} />
            <XAxis dataKey="i" tick={{ fontSize: 10, fill: 'currentColor' }} className="text-muted-foreground" tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} className="text-muted-foreground" tickLine={false} axisLine={false} width={46} tickFormatter={fmt} />
            <ReferenceLine y={opening} stroke="currentColor" className="text-muted-foreground" strokeDasharray="4 4" opacity={0.5} />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 }}
              labelFormatter={(i) => (i === 0 ? 'Opening' : `Trade ${i}`)}
              formatter={(v) => [`${cur}${fmt(v)}`, 'Trading equity']}
            />
            <Area type="monotone" dataKey="equity" stroke={color} strokeWidth={2.5} fill="url(#tradeEqFill)" animationDuration={500} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[190px] items-center justify-center text-center text-xs text-muted-foreground">
          Log at least two priced trades to plot trading equity.
        </div>
      )}
    </div>
  );
}
