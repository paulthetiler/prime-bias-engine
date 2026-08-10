import React from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import { blockBg, blockText, actionBadge, actionLabel, extraCheckStyle } from '@/lib/gradeStyles';
import ExtendedCautionPill, { isExtendedCaution } from './ExtendedCautionPill';

function userFacingWarning(warning) {
  if (warning === 'Workbook status is Wait — monitor 15m') return 'WAIT — monitor 15m before entry';
  if (warning === 'Workbook readiness is Trend Off') return 'TREND OFF — conditions aren’t fully aligned';
  return warning;
}

function MacdTrafficLights({ timeframes = {} }) {
  const lights = [
    { key: 'm5', label: '5', value: timeframes.m5?.indicators?.macd ?? 0 },
    { key: 'm15', label: '15', value: timeframes.m15?.indicators?.macd ?? 0 },
    { key: 'h1', label: 'H1', value: timeframes.h1?.indicators?.macd ?? 0 },
    { key: 'h4', label: 'H4', value: timeframes.h4?.indicators?.macd ?? 0 },
  ];

  return (
    <div className="flex items-center gap-1.5" aria-label="MACD timeframe alignment">
      {lights.map(light => (
        <div key={light.key} className="flex flex-col items-center gap-0.5" title={`${light.label}: ${light.value === 1 ? 'Up' : light.value === -1 ? 'Down' : 'Neutral'}`}>
          <span className="text-[7px] font-bold uppercase tracking-wide text-muted-foreground leading-none">{light.label}</span>
          <span
            className={cn(
              'w-3 h-3 rounded-full border',
              light.value === 1 && 'bg-emerald-500 border-emerald-600/60',
              light.value === -1 && 'bg-red-500 border-red-600/60',
              light.value !== 1 && light.value !== -1 && 'bg-secondary border-border'
            )}
          />
        </div>
      ))}
    </div>
  );
}

export default function BiasResult({ results, settings }) {
  if (!results) return null;

  const {
    grade, gradeLabel, tradeAction, readiness, status,
    deepTrend, deepStrength, ddBias, ddStrength, nowBias, nowStrength,
    winningScore, warnings, targetNote, extraCheckConfirmation,
    extraDirection, extraQuality, timeframes,
  } = results;
  const extraCheck = extraCheckStyle(extraCheckConfirmation);

  const statusBadge = status === 'YES' || status === 'Scalp'
    ? 'bg-primary/15 text-primary border-primary/30'
    : status === 'Wait'
    ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30'
    : 'bg-secondary text-muted-foreground border-border';

  const extraCheckLabel = extraCheckConfirmation === 'CONFIRMS'
    ? 'Confirms'
    : extraCheckConfirmation === 'CONFLICTS'
    ? 'Conflicts'
    : extraCheck.label;

  return (
    <div className="space-y-2.5">
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="flex min-h-[100px]">
          <div className="flex flex-col items-center justify-center px-4 py-3 bg-secondary/40 border-r border-border min-w-[76px]">
            <span className="text-4xl font-black tracking-tight text-foreground leading-none">{grade}</span>
            <span className="text-[10px] font-medium text-muted-foreground mt-1 text-center leading-tight">{gradeLabel}</span>
          </div>

          <div className="flex flex-col justify-center px-3 py-3 flex-1 gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Status</span>
              <span className={cn('text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', statusBadge)}>
                {status || '—'}
              </span>
              {isExtendedCaution(results) && <ExtendedCautionPill />}
            </div>

            <div className="grid items-center gap-y-0.5" style={{ gridTemplateColumns: '80px 1fr' }}>
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground py-1.5">Trade</span>
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded self-start w-fit my-1', actionBadge(tradeAction))}>
                {actionLabel(tradeAction)}
              </span>

              <span className="text-[9px] uppercase tracking-widest text-muted-foreground py-1.5 border-t border-border/45">Readiness</span>
              <span className="text-[11px] font-semibold text-foreground py-1.5 border-t border-border/45">{readiness || '—'}</span>

              <span className="text-[9px] uppercase tracking-widest text-muted-foreground py-1.5 border-t border-border/45">Extra Check</span>
              <span className="py-1 border-t border-border/45">
                <span className={cn('text-[9px] font-semibold px-2 py-0.5 rounded inline-flex w-fit', extraCheck.badge)}>
                  {extraCheckLabel}
                </span>
              </span>

              <span className="text-[9px] uppercase tracking-widest text-muted-foreground py-1.5 border-t border-border/45">Setup Quality</span>
              <span className="text-[11px] font-mono font-semibold text-foreground py-1.5 border-t border-border/45">{targetNote || '—'}</span>

              {(extraDirection || extraQuality) && <>
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground py-1.5 border-t border-border/45">MACD Extra</span>
                <div className="flex items-end gap-2 flex-wrap py-1.5 border-t border-border/45">
                  <MacdTrafficLights timeframes={timeframes} />
                  <span className="text-[11px] font-mono font-semibold text-foreground pb-px">
                    {[extraQuality, extraDirection].filter(Boolean).join(' ')}
                  </span>
                </div>
              </>}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">Block Breakdown</div>
        <div className="grid grid-cols-3 gap-1.5">
          <TrendPill label="Deep" value={deepTrend} sub={deepStrength} />
          <TrendPill label="DD" value={ddBias} sub={ddStrength} />
          <TrendPill label="Now" value={nowBias} sub={nowStrength} />
        </div>
      </div>

      {settings?.showBackendScore && (
        <div className="rounded-lg border border-border bg-secondary/40 p-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Score</span>
            <span className="font-mono font-semibold text-foreground">{winningScore ?? 0} pts</span>
          </div>
        </div>
      )}

      {warnings?.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-50/80 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/30 p-2.5 text-xs text-amber-800 dark:text-amber-400 backdrop-blur-sm">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-70" />
              <span className="leading-snug">{userFacingWarning(w)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrendPill({ label, value, sub }) {
  return (
    <div className={cn('rounded-lg border p-2 text-center shadow-sm', blockBg(value))}>
      <div className="text-[8px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">{label}</div>
      <div className={cn('text-[12px] font-bold leading-tight', blockText(value))}>{value || '—'}</div>
      {sub && <div className={cn('text-[8px] mt-0.5 leading-tight', blockText(value))}>{sub}</div>}
    </div>
  );
}
