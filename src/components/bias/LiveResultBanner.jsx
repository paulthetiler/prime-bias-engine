import React from 'react';
import { cn } from '@/lib/utils';

function Block({ label, dir, strength }) {
  const color = dir === 'BUY' || dir === 'BULL' ? 'text-emerald-400'
    : dir === 'SELL' || dir === 'BEAR' ? 'text-red-400' : 'text-muted-foreground';
  return (
    <div className="text-center min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('text-xs font-bold truncate', color)}>{dir || '—'}</div>
      {strength && <div className="text-[9px] text-muted-foreground leading-tight">{strength}</div>}
    </div>
  );
}

const gradeColors = {
  A: 'text-emerald-400', B: 'text-blue-400', C: 'text-yellow-400', D: 'text-orange-400', F: 'text-red-400',
};

const actionBg = {
  TRADE: 'bg-emerald-500', WAIT: 'bg-yellow-500', NO_TRADE: 'bg-red-500',
};

export default function LiveResultBanner({ results }) {
  if (!results) return null;
  const { mainDirection, grade, status, tradeAction, deepTrend, deepStrength, ddBias, ddStrength, nowBias, nowStrength } = results;
  const dirColor = mainDirection === 'BUY' ? 'text-emerald-400' : mainDirection === 'SELL' ? 'text-red-400' : 'text-muted-foreground';

  return (
    <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm px-3 py-2.5">
      <div className="flex items-center gap-3">
        {/* Direction */}
        <div className="text-center shrink-0">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Dir</div>
          <div className={cn('text-sm font-bold', dirColor)}>{mainDirection}</div>
        </div>

        <div className="w-px h-8 bg-border" />

        {/* Blocks */}
        <div className="flex gap-3 flex-1 min-w-0">
          <Block label="Deep" dir={deepTrend} strength={deepStrength} />
          <Block label="DD" dir={ddBias} strength={ddStrength} />
          <Block label="Now" dir={nowBias} strength={nowStrength} />
        </div>

        <div className="w-px h-8 bg-border" />

        {/* Grade + Status */}
        <div className="text-center shrink-0">
          <div className={cn('text-sm font-bold', gradeColors[grade])}>{grade}</div>
          <div className={cn('text-[9px] font-semibold rounded px-1 text-white', actionBg[tradeAction])}>{tradeAction === 'NO_TRADE' ? 'WAIT' : tradeAction}</div>
        </div>
      </div>
    </div>
  );
}