import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';

const sections = [
  {
    title: '🔍 Overview',
    content: `PrimeBias is a multi-timeframe bias engine that gives you a fast, structured read on market direction — designed for minimal thinking and quick decisions.

It scores indicators across 7 timeframes grouped into three blocks:
• Deep (Broadstroke) — The big-picture trend
• DD (Daily Driver) — The medium-term bias
• Now (Momentum) — What the market is doing right now

The result is a directional bias (BUY / SELL / NEUTRAL), a grade (A–F), a trade action (TRADE / WAIT / NO TRADE), and a block alignment indicator (HIGH / MEDIUM / LOW).`
  },
  {
    title: '📋 Step 1 — Add an Instrument',
    content: `Tap the "Bias Tool" tab and tap "Select instrument..." to choose an asset (e.g. EURUSD, GOLD, US30).

The asset is immediately added to your active set and will appear as a card on the Summary dashboard.

You can have multiple instruments active at once. Switch between them using the quick-switch tabs that appear at the top of the Bias Tool once more than one is active.

To remove an instrument, select it and tap "Remove".`
  },
  {
    title: '🎛️ Step 2 — Enter Your Indicators',
    content: `For each timeframe row, tap the indicator buttons to score them:

  — (grey) = Neutral / no signal
  +1 (green) = Bullish
  −1 (red) = Bearish

Default style: each tap cycles → neutral → +1 → −1 → neutral.

The four indicators per row are:
• Close — price above/below a key level
• MACD — bullish or bearish momentum
• RSI — overbought/oversold territory
• Boli — price above/below Bollinger midline

Note: H1, M15, and M5 rows don't use Close (greyed out). They use the three oscillators only.

You can switch to "Button" input style in Settings for explicit B / N / S buttons instead of tap-cycling.`
  },
  {
    title: '⚡ Live Result Banner',
    content: `As you enter data, a live result banner appears below the instrument selector showing:
• Main direction (BUY / SELL)
• Deep / DD / Now block summary
• Grade and trade action

No need to scroll — the decision is always visible as you type.`
  },
  {
    title: '🚦 Extra Check (Red / Green Light)',
    content: `Below the timeframe rows is the Extra Check — a quick red/green confirmation using H1 and M15 as a standalone cross-check.

Set each to +1 or −1:
• Both match → Green Light ✅ (aligned, proceed)
• They conflict → Red Light 🔴 (caution, wait)

This is optional but recommended as a final filter before entry.`
  },
  {
    title: '📁 Summary Dashboard',
    content: `The Summary tab shows all your active analyses as cards.

Each card shows:
• Direction and trade action
• Grade and status
• Deep / DD / Now block breakdown
• Score, Target, and Alignment (toggle in Settings)
• "Why this trade?" explanation (toggle in Settings)

Tap any card to open the Full Decision View — a detailed modal with all metrics and the full "Why this trade?" breakdown.

Inside the modal, tap "Edit" to jump directly to that instrument in the Bias Tool.`
  },
  {
    title: '🔎 Alignment Indicator',
    content: `Each card shows an alignment indicator reflecting how many of the three blocks agree with the main direction:

• HIGH — all three blocks aligned (Deep, DD, Now)
• MEDIUM — two of three blocks aligned
• LOW — only one or none aligned

Use this alongside the grade to assess conviction. A B-grade with HIGH alignment is more reliable than an A-grade with LOW alignment.`
  },
  {
    title: '🧠 Why This Trade?',
    content: `The "Why this trade?" section explains the engine's reasoning in plain language — one bullet for each block plus the score and alignment summary.

Example bullets:
• "Deep trend is bearish and strong"
• "DD confirms sell but is medium strength"
• "Now is currently neutral — not yet aligned"
• "Weighted score favours sell (60 pts)"
• "Two of three blocks aligned — medium confidence"

Enable or disable this in Settings → Display → Why this trade?`
  },
  {
    title: '🎓 Grades & Trade Actions',
    content: `Grade (A–F) reflects how well the bias is confirmed across blocks and score:

  A = Very strong — all blocks aligned, high score
  B = Strong — minor conflict, well-weighted
  C = Moderate — some mixed signals
  D = Weak — significant conflict
  F = No clear bias / do not trade

  F (Extended) = Extremely one-sided — score so high the market may be overextended. Treat with extra caution.

Trade Action:
  TRADE = High confidence, aligned setup
  WAIT = Signals present but not fully aligned yet
  NO TRADE = Conflicting or flat — stay out`
  },
  {
    title: '🔧 Filters',
    content: `Use the filter button (top-right of Summary) to narrow down your card list:

• A/B Only — hide C, D, F grades
• Hide WAIT — show only TRADE and NO TRADE
• Hide Extended — remove extreme/overextended setups
• Aligned Only — show only HIGH or MEDIUM alignment

Active filter count is shown on the filter button. Default filters can be set in Settings → Default Filters.`
  },
  {
    title: '📏 ATR Setup',
    content: `Go to the ATR tab to set custom ATR values for your top 5 assets.

The ATR (Average True Range) is used to calculate the trade target. If no custom value is set, the engine falls back to a built-in default per asset.

How to set it:
1. Select your asset from the dropdown
2. Enter the current ATR (from your chart — e.g. Daily or H4 ATR indicator)
3. Tap Save

The target shown on the Bias Tool and Dashboard will update automatically.`
  },
  {
    title: '📜 History',
    content: `Every save (manual or auto) creates a record in History.

From the History tab you can:
• Review past analyses
• Record trade outcomes (Win / Loss / Breakeven / Pending)
• Add personal notes
• Delete old records

Use History to track the accuracy of your bias reads over time.`
  },
  {
    title: '⚙️ Settings',
    content: `Settings → Display: Toggle what appears on each dashboard card — Why this trade?, Alignment, Score, Target, Notes, Compact mode.

Settings → Input Style: Switch between Tap-cycle (default) and Button input modes.

Settings → Default Filters: Set which filters are pre-applied on the Summary dashboard.

Settings → Advanced Logic: Experimental overrides — M5 override, NOW weakness downgrade, require alignment for A grade.

Settings → Scoring Weights: Adjust the points each timeframe contributes to the grade calculation.

Settings → Grade Thresholds: Set the minimum score required for each grade.

Tap "Reset" at the top of Settings to restore all defaults.`
  },
  {
    title: '💾 Auto-Save',
    content: `The Bias Tool auto-saves your analysis to the database 1.5 seconds after you stop making changes.

A small "Saving..." spinner and a green "Saved" tick appear in the header to confirm.

You can also tap the Save button at any time to manually force a save to History.`
  },
  {
    title: '⚠️ Warnings',
    content: `Yellow warnings appear when the engine detects conflicting signals:
• Deep and DD pointing in opposite directions
• Now momentum strongly opposing the main trend
• Very low confidence score

Warnings don't mean "don't trade" — they flag elevated risk. Always apply your own judgment and proper risk management.`
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