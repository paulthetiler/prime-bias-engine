import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const sections = [
  {
    title: '🔍 Overview',
    content: `PrimeBias reproduces the Prime Bias Excel workbook logic in app form. The workbook is the source of truth.

It calculates seven timeframe results, then the Deep, DD and Now blocks, weighted BUY/SELL scores, grade, status, trade direction, readiness and setup quality.

The app may present those results more clearly than the spreadsheet, but it must not reinterpret the workbook maths.`
  },
  {
    title: '🎛️ Enter Your Indicators',
    content: `For each timeframe, enter the same indicator states you would enter in the spreadsheet:

— = Neutral
+1 = Bullish
−1 = Bearish

The timeframe result is calculated from the workbook's indicator weights and ±35 threshold. Deep, DD and Now are then calculated from those timeframe results.`
  },
  {
    title: '🚦 Extra Check',
    content: `The manual Extra Check uses 1H and 15m:

Both +1 → BUY
Both −1 → SELL
Mixed → No Trade

Important: the workbook also gives a matching Extra Check +5 points to that side's score. That means it can change the final grade around a threshold. For example, 75 is A, but a confirming +5 can make the score 80, which is C/Risky in the workbook.

The displayed confirmation badge simply tells you whether the Extra Check agrees with the main Trade direction.`
  },
  {
    title: '🎓 Grade',
    content: `The workbook grade bands are:

92+ = F
80–91 = C (Risky)
75–79 = A
55–74 = B
45–54 = C
Below 45 = D

The block-trend cap can force the displayed grade to C when the workbook's block-weighted trend disagrees with the score direction.`
  },
  {
    title: '📍 Status',
    content: `Status comes directly from the workbook P10 formula. It is not generated from the grade by the app.

Possible workbook outputs include:
Extended
NO
YES
Wait
Scalp
No

Scalp is therefore a specific workbook condition. C grade does not automatically mean Scalp.`
  },
  {
    title: '↕️ Trade & Readiness',
    content: `Trade and Readiness are separate workbook outputs.

Trade comes from AC34 and is BUY, SELL or NILL. A tied score uses the 1H direction; if 1H is neutral the result is NILL.

Readiness comes from the workbook's separate readiness formula and is shown independently, for example Ready or Trend Off.

PrimeBias does not turn A/B/C/D into an invented TRADE/WAIT verdict.`
  },
  {
    title: '🎯 Setup Quality',
    content: `Setup Quality comes from the workbook O11 formula and is based on Deep/DD/Now alignment, not directly on the grade.

The workbook outputs GOOD, MED or Min. PrimeBias displays that result with the Trade direction where appropriate.

A C-grade setup can therefore still have GOOD setup quality if the workbook's block conditions produce GOOD.`
  },
  {
    title: '⚡ MACD Extra',
    content: `The workbook also contains a separate MACD Extra calculation using 4H, 1H, 15m and 5m MACD conditions.

PrimeBias preserves that separate result and quality classification instead of folding it into the manual Extra Check.`
  },
  {
    title: '📁 Summary',
    content: `The Summary shows the canonical workbook outputs for every active instrument: grade, status, Trade direction, readiness, Deep/DD/Now and other selected display information.

Hide WAIT filters the workbook Status = Wait result. Hide Extended filters Status = Extended.`
  },
  {
    title: '📏 Minimum Safe Move',
    content: `Minimum Safe Move is the ATR-derived room-to-breathe figure used by PrimeBias. It is not a take-profit. Your actual target still comes from market structure.`
  },
  {
    title: '💾 Engine Versioning',
    content: `Completed trades store the engine version used to calculate them. When the canonical engine changes, a new version is used so performance statistics do not mix trades produced by different rulesets.`
  },
];

function Section({ title, content }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/50 transition-colors">
        <span className="text-sm font-semibold">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 text-xs text-muted-foreground leading-relaxed whitespace-pre-line border-t border-border bg-secondary/20">{content}</div>}
    </div>
  );
}

export default function HowToGuide({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto">
      <div className="max-w-lg mx-auto p-4 pb-24">
        <div className="flex items-center justify-between pt-4 pb-4 sticky top-0 bg-background/95 backdrop-blur-sm">
          <div><h2 className="text-lg font-bold">How to Use PrimeBias</h2><p className="text-xs text-muted-foreground">Canonical Excel rules</p></div>
          <button onClick={onClose} className="text-xs font-semibold text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/10 transition-colors">Close</button>
        </div>
        <div className="space-y-2">{sections.map(s => <Section key={s.title} title={s.title} content={s.content} />)}</div>
      </div>
    </div>
  );
}
