import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';

const sections = [
  {
    title: '🔍 Overview',
    content: `PrimeBias is a multi-timeframe bias engine that gives you a fast, structured read on market direction — designed for minimal thinking and quick decisions.

It scores indicators across 7 timeframes grouped into three blocks:
• Deep (Broadstroke) — The big-picture macro trend
• DD (Daily Driver) — The medium-term execution bias
• Now (Momentum) — What the market is doing right now

The result is a directional bias (BUY / SELL), a grade (A–F), a trade action (TRADE / WAIT / NO TRADE), and a block alignment indicator (HIGH / MEDIUM / LOW).`
  },
  {
    title: '📋 Step 1 — Add an Instrument',
    content: `Tap the "Bias Tool" tab and tap "Select instrument..." to choose an asset (e.g. EUR/USD, GOLD, US100).

The asset is immediately added to your active set and appears as a card on the Summary dashboard.

You can have multiple instruments active at once. Switch between them using the quick-switch tabs at the top of the Bias Tool.

To remove an instrument, select it and tap "Remove".

To clear all active analyses, tap the trash icon in the top-right of the Bias Tool or Summary.`
  },
  {
    title: '🎛️ Step 2 — Enter Your Indicators',
    content: `For each timeframe row, score the four indicators:

  — (grey) = Neutral / no signal
  +1 (green) = Bullish
  −1 (red) = Bearish

Default (Tap-cycle): each tap cycles → neutral → +1 → −1 → neutral.
Button style: explicit BUY / NEUTRAL / SELL buttons. Change in Settings → Input Style.

The four indicators per row:
• Close — price above or below a key level
• MACD — bullish or bearish momentum
• RSI — overbought or oversold territory
• Boli — price above or below Bollinger midline

Note: H1, M15, and M5 rows don't use Close (it's greyed out). These rows use the three oscillators only.`
  },
  {
    title: '⚡ Live Result Banner',
    content: `As you enter data, a live result banner appears below the instrument selector showing:
• Main direction (BUY / SELL)
• Deep / DD / Now block summary with strengths
• Grade and trade action

The decision is always visible as you work — no need to scroll down.`
  },
  {
    title: '🚦 Extra Check (Red / Green Light)',
    content: `Below the timeframe rows is the Extra Check — a quick standalone confirmation using H1 and M15.

Set each to +1 or −1:
• Both match → Green Light ✅ (aligned — adds +5 pts to the winning side)
• They conflict → Red Light 🔴 (caution — no bonus added)

This is optional but recommended as a final filter before entry.`
  },
  {
    title: '📁 Summary Dashboard',
    content: `The Summary tab shows all your active analyses as cards.

Each card shows:
• Direction and trade action badge
• Grade and status
• Deep / DD / Now block breakdown
• Score, Target, and Alignment (each toggleable in Settings)
• "Why this trade?" explanation (toggleable in Settings)

Tap any card to open the full Detail Modal — all metrics in one view with the full block breakdown and warnings.

Inside the modal, tap "Edit" to jump directly to that instrument in the Bias Tool.

Filter your card list using the filter button (top-right). Active filter count is shown on the badge.

When a trade is done, tap "Complete Trade" on the card to log it instantly.`
  },
  {
    title: '✅ Completing a Trade',
    content: `Tap "Complete Trade" on any Summary card to log the outcome.

Quick Mode (default — one tap):
1. A bottom sheet appears with four large buttons: WIN / LOSS / BREAK EVEN / NOT TAKEN
2. Tap your result — the trade is instantly saved and removed from Summary
3. A toast appears: "Trade saved → Undo" — tap Undo within 6 seconds to restore it
4. Optionally tap "Add details" to enter entry/exit price, P&L, or notes after saving

Detailed Mode (full form before saving):
• Prompts for result, entry, exit, P&L, and notes before saving
• Switch between modes in Settings → Trade Completion

What is always saved automatically (no input needed):
• Asset, direction, grade, status
• Deep / DD / Now blocks and strengths
• Score, target, alignment
• Date/time created and completed
• Full inputs snapshot`
  },
  {
    title: '🔎 Alignment Indicator',
    content: `Each card shows an alignment indicator reflecting how many of the three blocks agree with the main direction:

• HIGH — all three blocks aligned (Deep, DD, Now)
• MEDIUM — two of three blocks aligned
• LOW — only one or none aligned

Use this alongside the grade to assess conviction. A B-grade with HIGH alignment is often more reliable than an A-grade with LOW alignment.`
  },
  {
    title: '🧠 Why This Trade?',
    content: `The "Why this trade?" section explains the engine's reasoning in plain language — one bullet per block plus score and alignment summary.

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
    content: `Grade (A–F) reflects how well the bias is confirmed across blocks and weighted score:

  A = Very Good — strong alignment, high score
  B = Good — minor conflict, well-weighted
  C = Risky — some mixed signals
  D = Dangerous — significant conflict
  F = No Trade — conflicting or flat

  F (Extended) = Score ≥90 — extremely one-sided. Market may be overextended. Do not trade.
  C (Risky) = Score 85–89 — approaching extended territory. Use caution.

  Note: If the Deep block conflicts with the score direction, the grade is capped at C regardless of score.

Trade Action:
  TRADE = High confidence, aligned setup
  WAIT = Signals present but not fully aligned yet
  NO TRADE = Conflicting, flat, or extended — stay out`
  },
  {
    title: '🔧 Filters',
    content: `Use the filter button (top-right of Summary) to narrow your card list:

• A/B Only — hide C, D, F grades
• Hide WAIT — show only TRADE and NO TRADE actions
• Hide Extended — remove overextended setups
• Aligned Only — show only HIGH or MEDIUM alignment

Active filter count is shown on the filter button badge.

Set default filters in Settings → Default Filters so they're pre-applied every session.`
  },
  {
    title: '📏 ATR Setup',
    content: `Go to the ATR tab to set custom ATR values for your assets.

The ATR (Average True Range) is used to calculate the price target shown on cards and in the Bias Tool.

If no custom ATR is set, the engine uses a built-in default per asset.

How to set it:
1. Select your asset from the dropdown
2. Enter the current ATR (from your chart, e.g. Daily or H4 ATR indicator)
3. Tap Save

The target on the Summary and Bias Tool updates automatically. You can add up to 5 top assets plus additional extras.`
  },
  {
    title: '📒 Trade History',
    content: `The Trades tab is your completed trade journal.

When you complete a trade from Summary, it moves here with the full engine snapshot automatically saved.

From Trade History you can:
• Browse and filter by Result, Grade, Direction, or Asset
• View analytics — win rate, total trades, best grade, best and worst asset
• Open any trade for the full detail view
• Restore a trade back to Summary (e.g. if completed by mistake)
• Archive a trade to remove it from the list`
  },
  {
    title: '💾 Auto-Save',
    content: `The Bias Tool auto-saves your analysis to the database 1.5 seconds after you stop making changes.

A small "Saving…" spinner and a green "Saved ✓" indicator appear in the header to confirm.

Inputs are also persisted to local storage on every change, so switching instruments or refreshing never loses your work.`
  },
  {
    title: '⚙️ Settings',
    content: `Display — Toggle what appears on each Summary card:
  Why this trade?, Alignment, Score, Target, Notes, Compact mode.

Input Style — Tap-cycle (default) or Button input.

Trade Completion — Quick Mode (one tap, default) or Detailed Mode (full form).

Default Filters — Pre-applied filters on the Summary dashboard.

Advanced Logic — Experimental overrides (M5 override, NOW weakness downgrade, require alignment for A).

Scoring Weights — Adjust the points each timeframe contributes to the grade.

Grade Thresholds — Set the minimum score for each grade.

Tap "Reset" at the top of Settings to restore all defaults.`
  },
  {
    title: '⚠️ Warnings',
    content: `Yellow warning banners appear when the engine detects conflicting signals:

• Deep Trend conflicts with score direction — grade capped at C
• NOW momentum is OPPOSITE to DD — momentum conflict
• DD block is NEUTRAL — no clear execution trend
• Deep Trend is NEUTRAL — no macro direction confirmed
• Score ≥90 — market EXTENDED, high reversal risk
• Score 85–89 — approaching extended territory, use caution

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