import React from 'react';
import { cn } from '@/lib/utils';
import { X, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WhyThisTrade from './WhyThisTrade';
import { calcAlignment, alignmentColor, alignmentBg } from '@/lib/alignmentUtils';

const gradeColors = {
  A: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  B: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
  C: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30',
  D: 'text-orange-400 bg-orange-500/15 border-orange-500/30',
  F: 'text-red-400 bg-red-500/15 border-red-500/30',
};

const actionColors = {
  TRADE: 'bg-emerald-500 text-white',
  WAIT: 'bg-yellow-500 text-black',
  NO_TRADE: 'bg-red-500 text-white',
};

function Row({ label, value, valueClass }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-xs font-semibold', valueClass)}>{value}</span>
    </div>
  );
}

function TrendPill({ label, dir, strength }) {
  const color = dir === 'BUY' || dir === 'BULL' ? 'text-emerald-400'
    : dir === 'SELL' || dir === 'BEAR' ? 'text-red-400' : 'text-muted-foreground';
  return (
    <div className="rounded-lg bg-secondary border border-border p-2.5 text-center flex-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={cn('text-sm font-bold', color)}>{dir || '—'}</div>
      {strength && <div className="text-[9px] text-muted-foreground mt-0.5">{strength}</div>}
    </div>
  );
}

export default function AssetDetailModal({ analysis, onClose, onEdit, settings }) {
  if (!analysis) return null;
  const { instrument, results, targetInfo } = analysis;
  if (!results) return null;

  const {
    mainDirection, grade, gradeLabel, status, tradeAction,
    deepTrend, deepStrength, ddBias, ddStrength, nowBias, nowStrength,
    winningScore, warnings,
  } = results;

  const alignment = calcAlignment(results);
  const dirColor = mainDirection === 'BUY' ? 'text-emerald-400' : mainDirection === 'SELL' ? 'text-red-400' : 'text-muted-foreground';
  const showTarget = settings?.showTarget !== false;
  const showScore = settings?.showScore !== false;
  const showAlignment = settings?.showAlignment !== false;
  const showWhy = settings?.showWhyThisTrade !== false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-0" onClick={onClose}>
      <div
        className="w-full max-w-md md:max-w-[520px] bg-card rounded-2xl border border-border shadow-2xl max-h-[calc(100vh-32px)] md:max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div>
            <div className="text-base font-bold">{instrument}</div>
            <div className="text-xs text-muted-foreground">Full Decision View</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5 h-8">
              <Edit2 className="w-3.5 h-3.5" />
              Edit
            </Button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4 pb-[120px]">
          {/* Direction + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className={cn('rounded-xl border-2 p-4 text-center', mainDirection === 'BUY' ? 'bg-emerald-500/10 border-emerald-500/30' : mainDirection === 'SELL' ? 'bg-red-500/10 border-red-500/30' : 'bg-secondary border-border')}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Direction</div>
              <div className={cn('text-3xl font-bold', dirColor)}>{mainDirection}</div>
            </div>
            <div className={cn('rounded-xl p-4 text-center flex flex-col items-center justify-center', actionColors[tradeAction])}>
              <div className="text-lg font-bold leading-tight">{tradeAction === 'NO_TRADE' ? 'NO TRADE' : tradeAction}</div>
              <div className="text-[10px] uppercase tracking-wider opacity-80 mt-0.5">{status}</div>
            </div>
          </div>

          {/* Grade + Metrics */}
          <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-0">
            <Row
              label="Grade"
              value={`${grade} — ${gradeLabel}`}
              valueClass={gradeColors[grade]?.split(' ')[0]}
            />
            {showAlignment && (
              <Row
                label="Alignment"
                value={alignment.label}
                valueClass={alignmentColor(alignment.label)}
              />
            )}
            {showScore && (
              <Row label="Score" value={`${winningScore} pts`} valueClass="text-foreground" />
            )}
            {showTarget && (
              <Row
                label="Target"
                value={targetInfo?.target ? targetInfo.target.toFixed(4) : '—'}
                valueClass="text-foreground font-mono"
              />
            )}
          </div>

          {/* Block breakdown */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Block Breakdown</div>
            <div className="flex gap-2">
              <TrendPill label="Deep" dir={deepTrend} strength={deepStrength} />
              <TrendPill label="DD" dir={ddBias} strength={ddStrength} />
              <TrendPill label="Now" dir={nowBias} strength={nowStrength} />
            </div>
          </div>

          {/* Why this trade */}
          {showWhy && <WhyThisTrade results={results} defaultOpen />}

          {/* Warnings */}
          {warnings?.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Warnings</div>
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-2.5 text-xs text-yellow-300">
                  <span>⚠</span><span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}