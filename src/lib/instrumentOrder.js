// Persisted ordering for the favourite-instrument pills (AssetQuickSwitch),
// plus the one-time "long press to reorder" hint flag. Both live in
// localStorage alongside the other primebias_* keys so a trader's custom pill
// order — and the fact they've learned the gesture — survive reloads and app
// restarts on the same device.
//
// The order is stored as a bare list of instrument symbols. It is intentionally
// decoupled from the active-analyses store (primebias_active): that store is
// keyed by instrument and its key order is an implementation detail, whereas the
// pill order is a deliberate, user-owned preference that must be stable even as
// analyses are added, edited or completed.

const ORDER_KEY = 'primebias_instrument_order';
const HINT_KEY = 'primebias_reorder_hint_seen';

/** Read the saved instrument order. Always returns a clean string[] (never throws). */
export function getInstrumentOrder() {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Persist a new instrument order and notify any listeners. */
export function saveInstrumentOrder(order) {
  const clean = (Array.isArray(order) ? order : []).filter((x) => typeof x === 'string');
  localStorage.setItem(ORDER_KEY, JSON.stringify(clean));
  window.dispatchEvent(new Event('instrumentOrderUpdated'));
}

/**
 * Order a list of analyses by the saved instrument order.
 *
 * - Instruments present in the saved order render in exactly that order.
 * - Instruments not yet in the saved order (newly added) keep their incoming
 *   relative order and are appended at the end, so a brand-new asset shows up
 *   without needing a save first.
 * - Saved instruments that no longer have an analysis are ignored.
 *
 * @param {Array<{instrument: string}>} analyses
 * @param {string[]} [order] saved order (defaults to what's in storage)
 * @returns {Array<{instrument: string}>}
 */
export function orderAnalyses(analyses = [], order = getInstrumentOrder()) {
  const rank = new Map(order.map((inst, i) => [inst, i]));
  const known = [];
  const unknown = [];
  for (const a of analyses) {
    (rank.has(a.instrument) ? known : unknown).push(a);
  }
  known.sort((x, y) => rank.get(x.instrument) - rank.get(y.instrument));
  return [...known, ...unknown];
}

/** True once the trader has successfully reordered their favourites at least once. */
export function hasSeenReorderHint() {
  return localStorage.getItem(HINT_KEY) === '1';
}

/** Record that the reorder gesture has been used — the hint never shows again. */
export function markReorderHintSeen() {
  localStorage.setItem(HINT_KEY, '1');
}
