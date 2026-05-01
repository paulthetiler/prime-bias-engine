/**
 * Single source of truth for trade completion.
 * All localStorage mutations happen here, synchronously, before biasUpdated is dispatched.
 */
import { base44 } from '@/api/base44Client';
import { calcAlignment } from '@/lib/alignmentUtils';

const ACTIVE_KEY      = 'primebias_active';
const INSTRUMENT_KEY  = 'primebias_instrument';
const LOCKS_KEY       = 'primebias_completed_locks';

// ── Lock helpers ──────────────────────────────────────────────────────────────

export function getLocks() {
  try { return JSON.parse(localStorage.getItem(LOCKS_KEY) || '{}'); } catch { return {}; }
}

export function isLocked(instrument) {
  return instrument in getLocks();
}

export function addLock(instrument) {
  const locks = getLocks();
  locks[instrument] = Date.now();
  localStorage.setItem(LOCKS_KEY, JSON.stringify(locks));
}

export function removeLock(instrument) {
  const locks = getLocks();
  delete locks[instrument];
  localStorage.setItem(LOCKS_KEY, JSON.stringify(locks));
}

// ── Main completion function ──────────────────────────────────────────────────

/**
 * completeTrade(analysis, result, details?)
 *
 * 1. Locks the instrument immediately (prevents any writes during async save)
 * 2. Removes from primebias_active synchronously
 * 3. Clears primebias_instrument if it matches
 * 4. Dispatches biasUpdated so UI reflects removal before DB call returns
 * 5. Saves CompletedTrade record to DB
 * 6. Returns the saved record
 */
export async function completeTrade(analysis, result, details = {}) {
  const { instrument, results, targetInfo, inputs, extraCheck, timestamp } = analysis || {};
  if (!instrument) throw new Error('No instrument on analysis');
  if (!result)     throw new Error('No result provided');

  // 1. Save to DB FIRST — so if this fails, nothing is removed from the UI
  const alignment = calcAlignment(results || {});
  const record = await base44.entities.CompletedTrade.create({
    instrument,
    status: 'completed',
    result,
    direction:        results?.mainDirection,
    grade:            results?.grade,
    trade_status:     results?.status,
    trade_action:     results?.tradeAction,
    score:            results?.winningScore,
    target:           targetInfo?.target || null,
    alignment:        alignment.label,
    deep_trend:       results?.deepTrend,
    deep_strength:    results?.deepStrength,
    dd_bias:          results?.ddBias,
    dd_strength:      results?.ddStrength,
    now_bias:         results?.nowBias,
    now_strength:     results?.nowStrength,
    extra_check_h1:   extraCheck?.h1 ?? null,
    extra_check_m15:  extraCheck?.m15 ?? null,
    inputs_snapshot:  inputs || {},
    created_at:       timestamp || new Date().toISOString(),
    completed_at:     new Date().toISOString(),
    entry_price:      details.entry   ? parseFloat(details.entry)   : null,
    exit_price:       details.exit    ? parseFloat(details.exit)    : null,
    pnl:              details.pnl     ? parseFloat(details.pnl)     : null,
    exit_reason:      details.exitReason || null,
    notes:            details.notes       || null,
    screenshot_url:   details.screenshotUrl || null,
  });

  // 2. Lock — prevents Input from re-writing this instrument
  addLock(instrument);

  // 3. Remove only this instrument from active set
  const active = JSON.parse(localStorage.getItem(ACTIVE_KEY) || '{}');
  delete active[instrument];
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));

  // 4. Update selected instrument pointer — switch to another active one if possible.
  //    Never fully remove it; that can trigger "new user" empty screens in Input.
  if (localStorage.getItem(INSTRUMENT_KEY) === instrument) {
    const remaining = Object.keys(active);
    if (remaining.length > 0) {
      localStorage.setItem(INSTRUMENT_KEY, remaining[0]);
    }
    // If none remain, leave the key pointing to the now-locked instrument.
    // The lock prevents Input from re-adding it. Dashboard shows empty state naturally.
  }

  // 5. Notify all listeners
  window.dispatchEvent(new Event('biasUpdated'));

  return record;
}

/**
 * undoCompletion(instrument, analysis, recordId)
 * Restores a trade back to active and removes the lock.
 */
export async function undoCompletion(instrument, analysis, recordId) {
  if (recordId) {
    await base44.entities.CompletedTrade.delete(recordId);
  }
  removeLock(instrument);
  const active = JSON.parse(localStorage.getItem(ACTIVE_KEY) || '{}');
  active[instrument] = analysis;
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
  window.dispatchEvent(new Event('biasUpdated'));
}