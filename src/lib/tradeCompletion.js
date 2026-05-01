/**
 * Single source of truth for trade completion.
 * Locks are keyed by analysisId (not instrument), so multiple analyses of the same instrument work.
 */
import { base44 } from '@/api/base44Client';
import { calcAlignment } from '@/lib/alignmentUtils';

const ACTIVE_KEY = 'primebias_active';
const LOCKS_KEY  = 'primebias_completed_locks'; // set of completed analysisIds

// ── Lock helpers ──────────────────────────────────────────────────────────────

export function getLocks() {
  try { return JSON.parse(localStorage.getItem(LOCKS_KEY) || '{}'); } catch { return {}; }
}

export function isAnalysisLocked(analysisId) {
  return analysisId in getLocks();
}

export function lockAnalysis(analysisId) {
  const locks = getLocks();
  locks[analysisId] = Date.now();
  localStorage.setItem(LOCKS_KEY, JSON.stringify(locks));
}

export function unlockAnalysis(analysisId) {
  const locks = getLocks();
  delete locks[analysisId];
  localStorage.setItem(LOCKS_KEY, JSON.stringify(locks));
}

// ── Main completion function ──────────────────────────────────────────────────

/**
 * completeTrade(analysis, result, details?)
 *
 * analysis MUST have a unique analysisId. If not, one is generated.
 * 1. Save to DB first (so if it fails, nothing is removed from the UI)
 * 2. Lock the analysisId (prevents this specific analysis from re-rendering)
 * 3. Remove from primebias_active
 * 4. Dispatch biasUpdated
 * 5. Return the saved record
 */
export async function completeTrade(analysis, result, details = {}) {
  const { instrument, results, targetInfo, inputs, extraCheck, timestamp, analysisId } = analysis || {};
  if (!instrument) throw new Error('No instrument on analysis');
  if (!result)     throw new Error('No result provided');

  // Generate analysisId if not present
  const id = analysisId || generateAnalysisId(instrument);

  console.log("PB_DEBUG_COMPLETE_TRADE_START", {
    instrument,
    analysisId: id,
    result,
    timestamp: new Date().toISOString(),
  });

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

  console.log("PB_DEBUG_COMPLETE_TRADE_DB_SAVED", {
    recordId: record.id,
    instrument: record.instrument,
    result: record.result,
  });

   // 2. Lock this specific analysisId
   lockAnalysis(id);

   // 3. Remove this specific analysis from active set (by ID)
   const activeBefore = JSON.parse(localStorage.getItem(ACTIVE_KEY) || '{}');
   const active = activeBefore;
   if (active[instrument]) {
     const analyses = Array.isArray(active[instrument]) 
       ? active[instrument].filter(a => a.analysisId !== id)
       : active[instrument].analysisId === id ? [] : [active[instrument]];

     if (analyses.length === 0) {
       delete active[instrument];
     } else if (analyses.length === 1) {
       active[instrument] = analyses[0];
     } else {
       active[instrument] = analyses;
     }
   }
   const activeAfter = active;
   localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeAfter));

   const locks = getLocks();

   console.log("PB_DEBUG_COMPLETE_TRADE_FINAL", {
     instrument,
     analysisId: id,
     primebias_activeBefore: activeBefore,
     primebias_activeAfter: activeAfter,
     completedAnalysisLocks: locks,
   });

   // 4. Notify all listeners
   window.dispatchEvent(new Event('biasUpdated'));

   return record;
}

/**
 * undoCompletion(analysisId, recordId)
 * Restores a trade back to active and removes the lock.
 */
export async function undoCompletion(analysisId, recordId) {
  if (recordId) {
    await base44.entities.CompletedTrade.delete(recordId);
  }
  unlockAnalysis(analysisId);
  // (The analysis is already in primebias_active because we only lock it; removal happens on explicit complete)
  window.dispatchEvent(new Event('biasUpdated'));
}

/**
 * Generate a unique analysis ID
 */
export function generateAnalysisId(instrument) {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toISOString().split('T')[1].split('.')[0].replace(/:/g, '');
  const rand = Math.random().toString(36).substring(2, 8);
  return `${instrument}-${date}-${time}-${rand}`;
}