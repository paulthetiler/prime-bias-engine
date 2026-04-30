import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';

const sections = [
  {
    title: '🔍 Overview',
    content: `PrimeBias is a multi-timeframe bias engine designed to give you a structured, objective read on market direction before you take a trade.

It works by scoring indicators across 7 timeframes — grouped into three blocks:
• Broadstroke (Deep Trend): The big picture direction
• DD (Daily Driver): The medium-term bias
• Now (Momentum): What the market is doing right now

The engine combines these blocks to produce a final directional bias (BUY / SELL / NEUTRAL), a grade (A–F), and a recommended action (TRADE / WAIT / NO TRADE).`
  },
  {
    title: '📋 Step 1 — Select an Instrument',
    content: `Go to the Bias Tool tab and tap "Select instrument..." to choose the asset you want to analyse (e.g. EURUSD, GOLD, US30).

Once selected, it will be added to your active analysis set and appear on the Dashboard summary.

You can have multiple instruments active at once and switch between them using the quick-switch tabs at the top.`
  },
  {
    title: '🎛️ Step 2 — Input Your Indicators',
    content: `For each timeframe row, tap the indicator buttons to score them:

  — (grey) = Neutral / no clear signal
  +1 (green) = Bullish signal
  −1 (red) = Bearish signal

Each tap cycles through: neutral → +1 → −1 → neutral.

The four indicators per timeframe are:
• Close — Is price closing above or below a key level?
• MACD — Is MACD bullish or bearish?
• RSI — Is RSI in bullish or bearish territory?
• Boli — Is price above or below the Bollinger Band midline?

Note: H1, M15, and M5 timeframes don't use the Close indicator (it's greyed out) as they rely on the three oscillators only.`
  },
  {
    title: '📊 Step 3 — Read the Timeframe Bias',
    content: `Each row shows a live bias score on the right:
• BUY (green) — majority of indicators are bullish
• SELL (red) — majority of indicators are bearish
• — (grey) — mixed or flat signals

The score number shows the net weighted total for that timeframe.`
  },
  {
    title: '🧠 Step 4 — Read the Bias Result',
    content: `Scroll down or tap "Bias Result" to see the computed output:

Trend — The primary directional bias driven by the Deep and DD blocks.

Now Momentum — Short-term momentum from H1/M15/M5. Can differ from the Trend — this is normal and indicates timing context.

Grade (A–F):
  A = Very strong alignment across all blocks
  B = Strong, minor conflict
  C = Moderate, some mixed signals
  D = Weak, significant conflict
  F = No clear bias — do not trade

Trade Action:
  TRADE = High confidence, aligned setup
  WAIT = Signals present but not fully aligned
  NO TRADE = Conflicting or flat — stay out

Target — An ATR-based price target calculated from the grade multiplier.`
  },
  {
    title: '🚦 Step 5 — Extra Check (Red/Green Light)',
    content: `The Extra Check section gives you a quick red/green confirmation using the H1 and M15 timeframes as a standalone cross-check.

Set each to +1 or −1:
• If both match → Green Light (confirmation to proceed)
• If they conflict → Red Light (caution, hold off)

This is optional but recommended as a final filter before entry.`
  },
  {
    title: '📏 ATR Setup',
    content: `Go to the ATR tab to set custom Average True Range values for your top 5 assets.

The ATR is used to calculate the trade target. If no custom ATR is set, the engine uses a built-in default for each asset.

How to set it:
1. Select your asset from the dropdown
2. Enter the current ATR value (find this on your chart, e.g. the ATR indicator on the daily or H4)
3. Tap Save

The target on the Bias Tool will update automatically.`
  },
  {
    title: '📁 Dashboard Summary',
    content: `The Dashboard tab shows all your active analyses at a glance.

Switch between List view (compact) and Cards view (detailed) using the buttons at the top.

Each entry shows:
• Direction (BUY/SELL/NEUTRAL)
• Grade
• Target
• Trade action
• Deep / DD / Now breakdown
• Any warnings

Tap "Edit" on a card to jump directly to that instrument in the Bias Tool.`
  },
  {
    title: '📜 History',
    content: `Every time you hit Save (or auto-save triggers), a record is stored in History.

From the History tab you can:
• Review past analyses
• Record trade outcomes (Win / Loss / Breakeven)
• Add personal notes
• Delete old records

This helps you track the accuracy of your bias reads over time.`
  },
  {
    title: '⚠️ Warnings',
    content: `Yellow warning banners appear when the engine detects conflicting signals, such as:
• Deep and DD blocks pointing in opposite directions
• Now momentum strongly opposing the main trend
• Very low confidence score

Warnings don't mean "don't trade" — they mean "be aware of the risk". Use your own judgment and always apply proper risk management.`
  },
  {
    title: '💾 Auto-Save',
    content: `The Bias Tool auto-saves your analysis to the database 1.5 seconds after you stop making changes.

You'll see a small "Saving..." spinner followed by a green "Saved" tick in the header when it completes.

You can also hit the Save button at any time to manually force a save to History.`
  },
];

function Section({ title, content }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
      >
        <span className="text-sm font-semibold">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 text-xs text-muted-foreground leading-relaxed whitespace-pre-line border-t border-border bg-secondary/20">
          {content}
        </div>
      )}
    </div>
  );
}

export default function HowToGuide({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto">
      <div className="max-w-lg mx-auto p-4 pb-24">
        <div className="flex items-center justify-between pt-4 pb-4 sticky top-0 bg-background/95 backdrop-blur-sm">
          <div>
            <h2 className="text-lg font-bold">How to Use PrimeBias</h2>
            <p className="text-xs text-muted-foreground">Tap any section to expand</p>
          </div>
          <button
            onClick={onClose}
            className="text-xs font-semibold text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/10 transition-colors"
          >
            Close
          </button>
        </div>
        <div className="space-y-2">
          {sections.map(s => (
            <Section key={s.title} title={s.title} content={s.content} />
          ))}
        </div>
      </div>
    </div>
  );
}