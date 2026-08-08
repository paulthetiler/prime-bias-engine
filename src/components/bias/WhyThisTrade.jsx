import React, { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { calcAlignment } from '@/lib/alignmentUtils';

function strengthAdj(s) {
  if (s === 'STRONG') return 'strong';
  if (s === 'MEDIUM') return 'medium strength';
  if (s === 'WEAK') return 'weak';
  return '';
}

function dirWord(d) {
  if (d === 'BUY' || d === 'BULL') return 'bullish';
  if (d === 'SELL' || d === 'BEAR') return 'bearish';
  return 'neutral';
}

export default function WhyThisTrade({ results, defaultOpen = false, onOpenFullView = null }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!results) return null;

  const {
    deepTrend, deepStrength,
    ddBias, ddStrength,
    nowBias, nowStrength,
    mainDirection, grade, status, readiness,
    winningScore, tradeAction, buyScore, sellScore, targetNote,
  } = results;

  const alignment = calcAlignment(results);
  const bullets = [];

  bullets.push(`Deep trend is ${dirWord(deepTrend)} and ${strengthAdj(deepStrength)}`);

  const ddConfirms = ddBias === mainDirection;
  bullets.push(ddConfirms
    ? `DD confirms ${ddBias.toLowerCase()} and is ${strengthAdj(ddStrength)}`
    : `DD is ${dirWord(ddBias)}${ddBias ? ' — does not confirm the main direction' : ''}`);

  const nowConfirms = nowBias === mainDirection;
  bullets.push(nowConfirms
    ? `Now confirms ${nowBias.toLowerCase()} and is ${strengthAdj(nowStrength)}`
    : `Now is ${dirWord(nowBias)} and ${strengthAdj(nowStrength)} — not aligned with the main direction`);

  const dominant = buyScore > sellScore ? 'buy' : sellScore > buyScore ? 'sell' : 'tied';
  bullets.push(dominant === 'tied'
    ? `Weighted score is tied (${winningScore} pts); the workbook tie-break decides Trade from 1H, or NILL if 1H is neutral`
    : `Weighted score favours ${dominant} (${winningScore} pts)`);

  bullets.push(alignment.label === 'HIGH'
    ? 'All three blocks are aligned'
    : alignment.label === 'MEDIUM'
      ? 'Two of three blocks are aligned'
      : 'Block alignment is low');

  if (targetNote) bullets.push(`Setup quality: ${targetNote}`);

  const resultLine = `${grade} grade · Status ${status} · Trade ${tradeAction}${readiness ? ` · ${readiness}` : ''}`;

  return (
    <div className="rounded-lg border border-border bg-card/50 cursor-pointer hover:border-primary/30 transition-colors" onClick={(e) => { e.stopPropagation(); onOpenFullView?.(); }}>
      <button onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <div className="flex items-center gap-2"><HelpCircle className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-xs font-semibold text-foreground">Why this result?</span></div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          <ul className="space-y-1.5">
            {bullets.map((b, i) => <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground"><span className="text-primary mt-0.5">•</span><span>{b}</span></li>)}
          </ul>
          <div className="mt-2 pt-2 border-t border-border"><span className="text-xs font-semibold text-foreground">Result: {resultLine}</span></div>
        </div>
      )}
    </div>
  );
}
