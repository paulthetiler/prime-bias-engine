import React from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, Cell, CartesianGrid,
} from 'recharts';
import { GRADE_HEX, gradeText } from '@/lib/gradeStyles';

const GRADES = ['A', 'B', 'C', 'D', 'F'];

function StatBox({ label, value, valueClass }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 text-center">
      <div className={cn('text-xl font-bold', valueClass)}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

export default function PerformanceAnalytics({ trades }) {
  const completed = trades.filter(t => t.result);
  const decisive = completed.filter(t => t.result === 'win' || t.result === 'loss');
  const wins = completed.filter(t => t.result === 'win').length;
  const losses = completed.filter(t => t.result === 'loss').length;
  const winRate = decisive.length > 0 ? Math.round((wins / decisive.length) * 100) : 0;

  // ── Equity curve (chronological cumulative P&L) ──
  const chrono = [...completed]
    .filter(t => t.completed_at)
    .sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
  const hasPnl = chrono.some(t => t.pnl != null);
  let running = 0;
  const equity = chrono.map((t, i) => {
    running += t.pnl != null ? t.pnl : 0;
    return { i: i + 1, date: t.completed_at, equity: parseFloat(running.toFixed(2)) };
  });
  const finalEquity = equity.length ? equity[equity.length - 1].equity : 0;

  // ── Win rate by grade ──
  const byGrade = GRADES.map(g => {
    const rows = decisive.filter(t => t.grade === g);
    const w = rows.filter(t => t.result === 'win').length;
    const rate = rows.length ? Math.round((w / rows.length) * 100) : 0;
    return { grade: g, rate, count: rows.length };
  });
  const gradesWithData = byGrade.filter(g => g.count > 0);

  // ── Streaks (chronological, decisive only) ──
  const decisiveChrono = chrono.filter(t => t.result === 'win' || t.result === 'loss');
  let longestWin = 0, cur = 0;
  for (const t of decisiveChrono) {
    if (t.result === 'win') { cur += 1; longestWin = Math.max(longestWin, cur); }
    else cur = 0;
  }
  // Current streak from the most recent decisive trade
  let currentStreak = 0, streakType = null;
  for (let k = decisiveChrono.length - 1; k >= 0; k--) {
    if (streakType === null) { streakType = decisiveChrono[k].result; currentStreak = 1; }
    else if (decisiveChrono[k].result === streakType) currentStreak += 1;
    else break;
  }

  // ── Best / weakest asset (by win rate, min 2 decisive trades) ──
  const assetStats = {};
  decisive.forEach(t => {
    const a = (assetStats[t.instrument] ||= { w: 0, n: 0 });
    a.n += 1;
    if (t.result === 'win') a.w += 1;
  });
  const ranked = Object.entries(assetStats)
    .filter(([, s]) => s.n >= 2)
    .map(([asset, s]) => ({ asset, rate: s.w / s.n, n: s.n }))
    .sort((a, b) => b.rate - a.rate);
  const bestAsset = ranked[0];
  const worstAsset = ranked.length > 1 ? ranked[ranked.length - 1] : null;

  if (completed.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Headline stats */}
      <div className="grid grid-cols-4 gap-2">
        <StatBox label="Trades" value={completed.length} />
        <StatBox label="Win Rate" value={`${winRate}%`} valueClass={winRate >= 50 ? 'text-emerald-500' : 'text-red-500'} />
        <StatBox label="Wins" value={wins} valueClass="text-emerald-500" />
        <StatBox label="Losses" value={losses} valueClass="text-red-500" />
      </div>

      {/* Streaks */}
      <div className="grid grid-cols-2 gap-2">
        <StatBox
          label="Current Streak"
          value={currentStreak > 0 ? `${currentStreak} ${streakType === 'win' ? 'W' : 'L'}` : '—'}
          valueClass={streakType === 'win' ? 'text-emerald-500' : streakType === 'loss' ? 'text-red-500' : ''}
        />
        <StatBox label="Best Win Streak" value={longestWin || '—'} valueClass="text-emerald-500" />
      </div>

      {/* Best / weakest asset */}
      {bestAsset && (
        <div className="grid grid-cols-2 gap-2">
          <StatBox label="Best Asset" value={bestAsset.asset} valueClass="text-emerald-500" />
          <StatBox
            label={worstAsset ? 'Needs Work' : 'Trades'}
            value={worstAsset ? worstAsset.asset : bestAsset.n}
            valueClass={worstAsset ? 'text-orange-500' : ''}
          />
        </div>
      )}

      {/* Equity curve */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Equity Curve</div>
          {hasPnl && (
            <div className={cn('text-sm font-bold font-mono', finalEquity >= 0 ? 'text-emerald-500' : 'text-red-500')}>
              {finalEquity >= 0 ? '+' : ''}{finalEquity}
            </div>
          )}
        </div>
        {hasPnl && equity.length > 1 ? (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={equity} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" opacity={0.4} />
              <XAxis dataKey="i" tick={{ fontSize: 10, fill: 'currentColor' }} className="text-muted-foreground" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} className="text-muted-foreground" tickLine={false} axisLine={false} width={38} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(i) => {
                  const p = equity[i - 1];
                  return p?.date ? format(new Date(p.date), 'dd MMM HH:mm') : `Trade ${i}`;
                }}
                formatter={(v) => [v, 'Equity']}
              />
              <Area type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} fill="url(#equityFill)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-8 text-xs text-muted-foreground">
            Add P&amp;L when completing trades to see your equity curve grow.
          </div>
        )}
      </div>

      {/* Win rate by grade */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Win Rate by Grade</div>
        <p className="text-[11px] text-muted-foreground mb-2">Do higher grades actually win more? This is your engine's report card.</p>
        {gradesWithData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={gradesWithData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" opacity={0.4} vertical={false} />
                <XAxis dataKey="grade" tick={{ fontSize: 12, fill: 'currentColor' }} className="text-muted-foreground" tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-muted-foreground" tickLine={false} axisLine={false} width={38} unit="%" />
                <Tooltip
                  cursor={{ fill: 'currentColor', opacity: 0.06 }}
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v, _n, p) => [`${v}% (${p.payload.count} trades)`, 'Win rate']}
                />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                  {gradesWithData.map(g => <Cell key={g.grade} fill={GRADE_HEX[g.grade]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-around mt-1">
              {gradesWithData.map(g => (
                <div key={g.grade} className="text-center">
                  <div className={cn('text-xs font-bold', gradeText(g.grade))}>{g.rate}%</div>
                  <div className="text-[9px] text-muted-foreground">{g.grade} · {g.count}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-xs text-muted-foreground">
            Log a few WIN/LOSS results to compare grades.
          </div>
        )}
      </div>
    </div>
  );
}
