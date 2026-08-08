import React from 'react';
import { cn } from '@/lib/utils';
import { X, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WhyThisTrade from './WhyThisTrade';
import StrengthContext from './StrengthContext';
import { calcAlignment, alignmentColor } from '@/lib/alignmentUtils';
import { formatWithUnit } from '@/lib/biasEngine';
import { blockBg, blockText, actionBadge, actionLabel, extraCheckStyle } from '@/lib/gradeStyles';
import ExtendedCautionPill, { isExtendedCaution } from './ExtendedCautionPill';

const gradeColors = {
  A: 'text-primary bg-primary/15 border-primary/30',
  B: 'text-foreground bg-secondary border-border',
  C: 'text-yellow-700 dark:text-yellow-400 bg-yellow-500/15 border-yellow-500/30',
  D: 'text-orange-700 dark:text-orange-400 bg-orange-500/15 border-orange-500/30',
  F: 'text-destructive bg-destructive/15 border-destructive/30',
};

function userFacingWarning(warning) {
  if (warning === 'Workbook status is Wait — monitor 15m') return 'WAIT — monitor 15m before entry';
  if (warning === 'Workbook readiness is Trend Off') return 'TREND OFF — conditions aren’t fully aligned';
  return warning;
}

function Row({ label, value, valueClass }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-xs font-semibold', valueClass)}>{value}</span>
    </div>
  );
}

function TrendPill({ label, dir, strength }) {
  return (
    <div className={cn('rounded-lg border p-2.5 text-center flex-1', blockBg(dir))}>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={cn('text-sm font-bold', blockText(dir))}>{dir || '—'}</div>
      {strength && <div className="text-[9px] text-muted-foreground mt-0.5">{strength}</div>}
    </div>
  );
}

export default function AssetDetailModal({ analysis, onClose, onEdit, settings, strengthData }) {
  if (!analysis) return null;
  const { instrument, results, targetInfo } = analysis;
  if (!results) return null;

  const {
    mainDirection, grade, gradeLabel, status, tradeAction, readiness,
    deepTrend, deepStrength, ddBias, ddStrength, nowBias, nowStrength,
    winningScore, warnings, extraCheckConfirmation, targetNote,
    extraDirection, extraQuality,
  } = results;

  const extraCheck = extraCheckStyle(extraCheckConfirmation);
  const alignment = calcAlignment(results);
  const dirColor = mainDirection === 'BUY' ? 'text-primary' : mainDirection === 'SELL' ? 'text-destructive' : 'text-muted-foreground';
  const showMinSafeMove = settings?.showTarget !== false;
  const showScore = settings?.showScore !== false;
  const showAlignment = settings?.showAlignment !== false;
  const showWhy = settings?.showWhyThisTrade !== false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-0" onClick={onClose}>
      <div className="w-full max-w-md md:max-w-[520px] bg-card rounded-2xl border border-border shadow-2xl max-h-[calc(100vh-32px)] md:max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div><div className="text-base font-bold">{instrument}</div><div className="text-xs text-muted-foreground">Full Decision View</div></div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5 h-8"><Edit2 className="w-3.5 h-3.5" /> Edit</Button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-4 space-y-4 pb-[120px]">
          <div className="grid grid-cols-2 gap-3">
            <div className={cn('rounded-xl border-2 p-4 text-center', mainDirection === 'BUY' ? 'bg-primary/10 border-primary/30' : mainDirection === 'SELL' ? 'bg-destructive/10 border-destructive/30' : 'bg-secondary border-border')}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Direction</div>
              <div className={cn('text-3xl font-bold', dirColor)}>{mainDirection}</div>
            </div>
            <div className={cn('rounded-xl p-4 text-center flex flex-col items-center justify-center', actionBadge(tradeAction))}>
              <div className="text-[10px] uppercase tracking-wider opacity-80 mb-0.5">Trade</div>
              <div className="text-lg font-bold leading-tight">{actionLabel(tradeAction)}</div>
              <div className="text-[10px] uppercase tracking-wider opacity-80 mt-1">Status {status || '—'}</div>
            </div>
          </div>

          {isExtendedCaution(results) && <div className="flex justify-center"><ExtendedCautionPill className="text-[10px] px-2.5 py-1" /></div>}

          <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-0">
            <Row label="Grade" value={`${grade} — ${gradeLabel}`} valueClass={gradeColors[grade]?.split(' ')[0]} />
            <Row label="Readiness" value={readiness || '—'} valueClass="text-foreground" />
            <Row label="Setup Quality" value={targetNote || '—'} valueClass="text-foreground font-mono" />
            {showAlignment && <Row label="Alignment" value={alignment.label} valueClass={alignmentColor(alignment.label)} />}
            {showScore && <Row label="Score" value={`${winningScore} pts`} valueClass="text-foreground" />}
            <Row label="Extra Check" value={extraCheck.label} valueClass={extraCheck.badge.split(' ').filter(c => c.startsWith('text-')).join(' ')} />
            {(extraDirection || extraQuality) && <Row label="MACD Extra" value={[extraQuality, extraDirection].filter(Boolean).join(' ')} valueClass="text-foreground font-mono" />}
            {showMinSafeMove && <Row label="Min Safe Move" value={formatWithUnit(targetInfo?.target, instrument) || '—'} valueClass="text-foreground font-mono" />}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Block Breakdown</div>
            <div className="flex gap-2">
              <TrendPill label="Deep" dir={deepTrend} strength={deepStrength} />
              <TrendPill label="DD" dir={ddBias} strength={ddStrength} />
              <TrendPill label="Now" dir={nowBias} strength={nowStrength} />
            </div>
          </div>

          {showWhy && <WhyThisTrade results={results} defaultOpen />}
          <StrengthContext instrument={instrument} strengthData={strengthData} />

          {warnings?.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Warnings</div>
              {warnings.map((w, i) => <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-50/80 dark:bg-amber-500/8 border border-amber-200/60 dark:border-amber-500/15 p-2.5 text-xs text-amber-800 dark:text-amber-300 backdrop-blur-sm"><span>⚠</span><span>{userFacingWarning(w)}</span></div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
