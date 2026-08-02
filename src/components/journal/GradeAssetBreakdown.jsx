import React from 'react';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { GRADE_HEX, gradeText } from '@/lib/gradeStyles';

/**
 * A single asset tile, matching the metric grid on the Performance page.
 * @param {{ label: string, value: React.ReactNode, sub?: string, tone?: 'up'|'down'|'neutral' }} props
 */
function AssetTile({ label, value, sub, tone = 'neutral' }) {
  const toneClass =
    tone === 'up' ? 'text-emerald-500' : tone === 'down' ? 'text-orange-500' : 'text-foreground';
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('mt-1.5 font-mono text-lg font-bold leading-none', toneClass)}>{value}</div>
      {sub && <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/**
 * The strategy-quality breakdowns that used to live on the Trades tab:
 * win-rate-by-grade (the engine's report card) and best / weakest asset.
 * Both take pre-computed data so this stays a pure presentation component.
 * @param {{
 *   grades: { grade: string, rate: number, count: number }[],
 *   assets: { asset: string, rate: number, n: number }[],
 * }} props
 */
export default function GradeAssetBreakdown({ grades, assets }) {
  const gradesWithData = grades.filter(g => g.count > 0);
  const best = assets[0];
  const worst = assets.length > 1 ? assets[assets.length - 1] : null;

  return (
    <div className="space-y-3">
      {/* Best / weakest asset */}
      {best && (
        <div className="grid grid-cols-2 gap-2.5">
          <AssetTile
            label="Best Asset"
            value={best.asset}
            sub={`${Math.round(best.rate * 100)}% · ${best.n} trades`}
            tone="up"
          />
          {worst ? (
            <AssetTile
              label="Needs Work"
              value={worst.asset}
              sub={`${Math.round(worst.rate * 100)}% · ${worst.n} trades`}
              tone="down"
            />
          ) : (
            <AssetTile
              label="Sample"
              value={best.n}
              sub={`decisive trades on ${best.asset}`}
            />
          )}
        </div>
      )}

      {/* Win rate by grade */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Win Rate by Grade</div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Do higher grades actually win more? This is your engine's report card.
        </p>
        {gradesWithData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={gradesWithData} margin={{ top: 10, right: 6, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" opacity={0.4} vertical={false} />
                <XAxis dataKey="grade" tick={{ fontSize: 12, fill: 'currentColor' }} className="text-muted-foreground" tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-muted-foreground" tickLine={false} axisLine={false} width={40} unit="%" />
                <Tooltip
                  cursor={{ fill: 'currentColor', opacity: 0.06 }}
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 }}
                  formatter={(v, _n, p) => [`${v}% (${p.payload.count} trades)`, 'Win rate']}
                />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                  {gradesWithData.map(g => <Cell key={g.grade} fill={GRADE_HEX[g.grade]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-1 flex justify-around">
              {gradesWithData.map(g => (
                <div key={g.grade} className="text-center">
                  <div className={cn('text-xs font-bold', gradeText(g.grade))}>{g.rate}%</div>
                  <div className="text-[9px] text-muted-foreground">{g.grade} · {g.count}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Log a few WIN/LOSS results to compare grades.
          </div>
        )}
      </div>
    </div>
  );
}
