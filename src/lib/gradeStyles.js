// Single source of truth for grade + result colours, so every screen agrees.

const GRADE_TEXT = {
  A: 'text-emerald-600 dark:text-emerald-400',
  B: 'text-blue-600 dark:text-blue-400',
  C: 'text-yellow-600 dark:text-yellow-400',
  D: 'text-orange-600 dark:text-orange-400',
  F: 'text-red-600 dark:text-red-400',
};

const GRADE_BADGE = {
  A: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  B: 'text-blue-600 dark:text-blue-400 bg-blue-500/15 border-blue-500/30',
  C: 'text-yellow-700 dark:text-yellow-400 bg-yellow-500/15 border-yellow-500/30',
  D: 'text-orange-600 dark:text-orange-400 bg-orange-500/15 border-orange-500/30',
  F: 'text-red-600 dark:text-red-400 bg-red-500/15 border-red-500/30',
};

export const GRADE_HEX = { A: '#10b981', B: '#3b82f6', C: '#eab308', D: '#f97316', F: '#ef4444' };
export const gradeText = (grade) => GRADE_TEXT[grade] || 'text-muted-foreground';
export const gradeBadge = (grade) => GRADE_BADGE[grade] || 'text-muted-foreground bg-secondary border-border';

const RESULT_TEXT = {
  win: 'text-emerald-600 dark:text-emerald-400',
  loss: 'text-red-600 dark:text-red-400',
  breakeven: 'text-yellow-600 dark:text-yellow-400',
  not_taken: 'text-muted-foreground',
};
export const resultText = (result) => RESULT_TEXT[result] || 'text-muted-foreground';

export const directionText = (dir) =>
  dir === 'BUY' ? 'text-emerald-600 dark:text-emerald-400'
  : dir === 'SELL' ? 'text-red-600 dark:text-red-400'
  : 'text-muted-foreground';

// Canonical workbook Trade = AC34: BUY / SELL / NILL.
// Legacy TRADE/WAIT values remain renderable for old saved analyses only.
const ACTION_BADGE = {
  TRADE: 'bg-primary text-white',
  WAIT: 'bg-yellow-500 text-black',
  BUY: 'bg-emerald-500 text-white',
  SELL: 'bg-red-500 text-white',
  NILL: 'bg-secondary text-muted-foreground border border-border',
  NO_TRADE: 'bg-destructive text-white',
  PENDING: 'bg-secondary text-muted-foreground border border-border',
};
export const actionBadge = (action) => ACTION_BADGE[action] || ACTION_BADGE.NILL;
export const actionLabel = (action) => action === 'NO_TRADE' ? 'NO TRADE' : action || 'NILL';

const EXTRA_CHECK_STYLE = {
  CONFIRMS: { badge: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30', label: 'Extra Check confirms' },
  CONFLICTS: { badge: 'text-yellow-700 dark:text-yellow-400 bg-yellow-500/15 border border-yellow-500/30', label: 'Extra Check conflicts' },
  NOT_CHECKED: { badge: 'text-muted-foreground bg-secondary border border-border', label: 'Extra Check not run' },
};
export const extraCheckStyle = (confirmation) => EXTRA_CHECK_STYLE[confirmation] || EXTRA_CHECK_STYLE.NOT_CHECKED;

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
