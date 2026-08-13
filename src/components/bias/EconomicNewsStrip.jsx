import React from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNewsExposure } from '@/lib/newsExposure';

function minutesUntil(dateValue) {
  const when = new Date(dateValue).getTime();
  if (!Number.isFinite(when)) return null;
  return Math.round((when - Date.now()) / 60000);
}

function formatCountdown(minutes) {
  if (minutes == null) return '';
  if (minutes < 0) return 'released';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function EconomicNewsStrip({ instrument, events, status }) {
  const currencies = getNewsExposure(instrument);
  const relevant = (events || [])
    .map(event => ({ ...event, minutes: minutesUntil(event.date) }))
    .filter(event => currencies.includes(event.country) && event.minutes != null && event.minutes >= -30)
    .filter(event => event.impact === 'High' || event.impact === 'Medium')
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, 2);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-1.5 min-w-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <CalendarDays className="w-3.5 h-3.5 shrink-0" />
            <span className="shrink-0">Economic news</span>
            {currencies.length > 0 && (
              <span className="truncate text-[9px] normal-case tracking-normal font-semibold text-muted-foreground/80">· {currencies.join(' · ')}</span>
            )}
          </div>
          <span className="text-[9px] text-muted-foreground shrink-0">Forex Factory</span>
        </div>

        {status === 'loading' && <div className="text-[10px] text-muted-foreground">Loading calendar…</div>}
        {status === 'error' && <div className="text-[10px] font-semibold text-destructive">Calendar unavailable</div>}
        {status === 'ready' && !currencies.length && <div className="text-[10px] text-muted-foreground">No supported news exposure for this instrument</div>}
        {status === 'ready' && currencies.length > 0 && relevant.length === 0 && <div className="text-[10px] text-muted-foreground">No high/medium impact news upcoming</div>}

        {relevant.length > 0 && (
          <div className="space-y-1.5">
            {relevant.map(event => {
              const high = event.impact === 'High';
              const time = new Date(event.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={event.id} className={cn('flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[10px]', high ? 'border-destructive/20 bg-destructive/5' : 'border-yellow-500/20 bg-yellow-500/5')}>
                  <span className={cn('w-2 h-2 rounded-full shrink-0', high ? 'bg-destructive' : 'bg-yellow-500')} />
                  <span className="font-mono font-semibold text-foreground shrink-0">{time}</span>
                  <span className="font-bold text-muted-foreground shrink-0">{event.country}</span>
                  <span className="truncate text-foreground font-medium">{event.title}</span>
                  <span className={cn('ml-auto shrink-0 font-bold', high ? 'text-destructive' : 'text-yellow-700 dark:text-yellow-400')}>{formatCountdown(event.minutes)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
