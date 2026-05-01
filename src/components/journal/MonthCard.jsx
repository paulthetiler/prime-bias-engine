import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

function Stat({ label, value, valueClass }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-xs font-semibold', valueClass || 'text-foreground')}>{value ?? '—'}</span>
    </div>
  );
}

function GoalPill({ label, value }) {
  return (
    <div className="rounded-lg bg-secondary border border-border p-2 text-center flex-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-bold text-foreground">{value ? `£${value.toFixed(0)}` : '—'}</div>
    </div>
  );
}

export default function MonthCard({ entry, onEdit }) {
  const [open, setOpen] = useState(false);

  const pnlPos = entry.pnl > 0;
  const pnlNeg = entry.pnl < 0;
  const pnlColor = pnlPos ? 'text-emerald-600 dark:text-emerald-400' : pnlNeg ? 'text-red-600 dark:text-red-400' : 'text-foreground';
  const borderColor = pnlPos ? 'border-emerald-500/30' : pnlNeg ? 'border-red-500/30' : 'border-border';
  const winratePct = entry.winrate != null ? `${(entry.winrate * 100).toFixed(0)}%` : '—';

  return (
    <div className={cn('rounded-xl border bg-card overflow-hidden transition-all', borderColor)}>
      {/* Header — always visible */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div>
          <div className="text-sm font-bold tracking-tight">{entry.month} {entry.year}</div>
          {entry.total_positions != null && (
            <div className="text-[11px] text-muted-foreground mt-0.5">{entry.total_positions} trades · {winratePct} WR</div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className={cn('text-base font-black', pnlColor)}>
              {entry.pnl != null ? `${entry.pnl >= 0 ? '+' : ''}£${entry.pnl.toFixed(2)}` : '—'}
            </div>
            {entry.pnl_percent != null && (
              <div className={cn('text-[11px] font-semibold', pnlColor)}>
                {entry.pnl_percent >= 0 ? '+' : ''}{entry.pnl_percent.toFixed(2)}%
              </div>
            )}
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-border/50 px-4 py-3 space-y-4">
          {/* Balance row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-secondary/60 border border-border p-2.5 text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Start</div>
              <div className="text-sm font-bold font-mono">£{entry.start_balance?.toFixed(2) ?? '—'}</div>
            </div>
            <div className="rounded-lg bg-secondary/60 border border-border p-2.5 text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">End</div>
              <div className="text-sm font-bold font-mono">£{entry.end_balance?.toFixed(2) ?? '—'}</div>
            </div>
          </div>

          {/* Stats */}
          <div className="rounded-xl border border-border bg-secondary/30 px-3 py-1">
            <Stat label="Total Pips" value={entry.total_pips?.toFixed(1)} />
            <Stat label="Ave Win" value={entry.ave_win != null ? `£${entry.ave_win.toFixed(2)}` : null} />
            <Stat label="Ave PIPs" value={entry.ave_pip?.toFixed(1)} />
            <Stat label="Wage" value={entry.wage != null ? `£${entry.wage.toFixed(2)}` : null} />
            <Stat label="Bid Size" value={entry.bid_size} />
            <Stat label="Next Bid" value={entry.next_bid} />
          </div>

          {/* Goals */}
          {(entry.goal_month || entry.goal_week || entry.goal_day) && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Goals</div>
              <div className="flex gap-2">
                <GoalPill label="Month" value={entry.goal_month} />
                <GoalPill label="Week" value={entry.goal_week} />
                <GoalPill label="Day" value={entry.goal_day} />
              </div>
            </div>
          )}

          {/* Rules */}
          {entry.rules?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Rules</div>
              <div className="space-y-1.5">
                {entry.rules.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {entry.notes && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Notes</div>
              <p className="text-xs text-muted-foreground leading-relaxed">{entry.notes}</p>
            </div>
          )}

          {/* Edit */}
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => onEdit(entry)}>
            <Edit2 className="w-3.5 h-3.5" /> Edit Entry
          </Button>
        </div>
      )}
    </div>
  );
}