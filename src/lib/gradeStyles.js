// Single source of truth for grade + result colours, so every screen agrees.

// Grade → text colour (used on cards, lists, modals)
const GRADE_TEXT = {
  A: 'text-emerald-600 dark:text-emerald-400',
  B: 'text-blue-600 dark:text-blue-400',
  C: 'text-yellow-600 dark:text-yellow-400',
  D: 'text-orange-600 dark:text-orange-400',
  F: 'text-red-600 dark:text-red-400',
};

// Grade → text + subtle background + border (used on badges)
const GRADE_BADGE = {
  A: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  B: 'text-blue-600 dark:text-blue-400 bg-blue-500/15 border-blue-500/30',
  C: 'text-yellow-700 dark:text-yellow-400 bg-yellow-500/15 border-yellow-500/30',
  D: 'text-orange-600 dark:text-orange-400 bg-orange-500/15 border-orange-500/30',
  F: 'text-red-600 dark:text-red-400 bg-red-500/15 border-red-500/30',
};

// Grade → raw hex (for chart fills / inline styles)
export const GRADE_HEX = {
  A: '#10b981', B: '#3b82f6', C: '#eab308', D: '#f97316', F: '#ef4444',
};

export const gradeText = (grade) => GRADE_TEXT[grade] || 'text-muted-foreground';
export const gradeBadge = (grade) => GRADE_BADGE[grade] || 'text-muted-foreground bg-secondary border-border';

// Result → text colour
const RESULT_TEXT = {
  win: 'text-emerald-600 dark:text-emerald-400',
  loss: 'text-red-600 dark:text-red-400',
  breakeven: 'text-yellow-600 dark:text-yellow-400',
  not_taken: 'text-muted-foreground',
};
export const resultText = (result) => RESULT_TEXT[result] || 'text-muted-foreground';

// Direction → text colour
export const directionText = (dir) =>
  dir === 'BUY' ? 'text-emerald-600 dark:text-emerald-400'
  : dir === 'SELL' ? 'text-red-600 dark:text-red-400'
  : 'text-muted-foreground';

// Final trade permission (Extra Check gate) → badge colour + human label.
// The engine's `tradeAction` is the Extra-Check verdict, kept separate from
// status/grade: PENDING (extra check unset), BUY, SELL, or NO_TRADE.
const ACTION_BADGE = {
  BUY:      'bg-emerald-500 text-white',
  SELL:     'bg-red-500 text-white',
  NO_TRADE: 'bg-destructive text-white',
  PENDING:  'bg-secondary text-muted-foreground border border-border',
};
export const actionBadge = (action) => ACTION_BADGE[action] || ACTION_BADGE.PENDING;

// Short label shown inside the Action badge.
export const actionLabel = (action) =>
  action === 'NO_TRADE' ? 'NO TRADE'
  : action === 'PENDING' ? 'PENDING'
  : action || 'PENDING';

// Longer hint for the PENDING state (e.g. shown under the badge on detail views).
export const actionHint = (action) =>
  action === 'PENDING' ? 'Set 1H & 15M extra checks' : '';

// Block direction (BUY/BULL, SELL/BEAR, NEUTRAL) → shaded card bg + border,
// matching the engine's indicator buttons: green buy, red sell, amber neutral.
const isBull = (d) => d === 'BUY' || d === 'BULL';
const isBear = (d) => d === 'SELL' || d === 'BEAR';

export const blockBg = (dir) =>
  isBull(dir) ? 'bg-emerald-500/10 border-emerald-500/30'
  : isBear(dir) ? 'bg-red-500/10 border-red-500/30'
  : 'bg-yellow-500/10 border-yellow-500/30';

export const blockText = (dir) =>
  isBull(dir) ? 'text-emerald-600 dark:text-emerald-400'
  : isBear(dir) ? 'text-red-600 dark:text-red-400'
  : 'text-yellow-600 dark:text-yellow-400';
