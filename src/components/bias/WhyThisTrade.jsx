import React, { useState } from 'react';
import { cn } from '@/lib/utils';
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

export default function WhyThisTrade({ results, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!results) return null;

  const {
    deepTrend, deepStrength,
    ddBias, ddStrength,
    nowBias, nowStrength,
    mainDirection, grade, gradeLabel,
    winningScore, tradeAction, status,
    buyScore, sellScore,
  } = results;

  const alignment = calcAlignment(results);

  const bullets = [];

  // Deep
  bullets.push(
    `Deep trend is ${dirWord(deepTrend)} and ${strengthAdj(deepStrength)}`
  );

  // DD
  const ddConfirms = (ddBias === mainDirection) || (ddBias === 'BUY' && mainDirection === 'BUY') || (ddBias === 'SELL' && mainDirection === 'SELL');
  bullets.push(
    ddConfirms
      ? `DD confirms ${ddBias.toLowerCase()} but is ${strengthAdj(ddStrength)}`
      : `DD is ${dirWord(ddBias)} — conflicts with main direction`
  );

  // Now
  const nowConfirms = nowBias === mainDirection;
  bullets.push(
    nowConfirms
      ? `Now momentum confirms ${nowBias.toLowerCase()} and is ${strengthAdj(nowStrength)}`
      : `Now is currently ${nowBias === 'NEUTRAL' ? 'neutral' : nowBias.toLowerCase()} and ${strengthAdj(nowStrength)} — not yet aligned`
  );

  // Score
  const dominant = buyScore >= sellScore ? 'buy' : 'sell';
  bullets.push(
    `Weighted score favours ${dominant} (${winningScore} pts)`
  );

  // Alignment
  bullets.push(
    alignment.label === 'HIGH'
      ? 'All three blocks are aligned — high conviction setup'
      : alignment.label === 'MEDIUM'
      ? 'Two of three blocks are aligned — medium confidence'
      : 'Low block alignment — timeframes not fully in sync'
  );

  const resultLine = `${grade} grade / ${status}`;

  return (
    <div className="rounded-lg border border-border bg-card/50">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Why this trade?</span>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          <ul className="space-y-1.5">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="text-primary mt-0.5">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 pt-2 border-t border-border">
            <span className="text-xs font-semibold text-foreground">Result: {resultLine}</span>
          </div>
        </div>
      )}
    </div>
  );
}