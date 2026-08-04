/**
 * Single source of truth for trade completion.
 * Locks are keyed by analysisId (not instrument), so multiple analyses of the same instrument work.
 */
import { base44 } from '@/api/base44Client';
import { calcAlignment } from '@/lib/alignmentUtils';
import { createEngineSnapshot } from '@/lib/biasEngine';
import {
  computeNetPnl, nonNegMoney, reconcileResult, normalizeMood,
  normalizeSplitCount, normalizeReasonTags, normalizeTradeDirection, finiteOrNull,
} from '@/lib/tradeFinancials';

const ACTIVE_KEY = 'primebias_active';
const LOCKS_KEY  = 'primebias_completed_locks'; // set of completed analysisIds

// ── Validation helpers ───────────────────────────────────────────────────────

function isValidAnalysisId(id) {
  // Valid format: "INSTRUMENT-YYYY-MM-DD-HHMMSS-suffix"
  // Must contain at least one "-"
  return typeof id === 'string' && id.includes('-');
}

function purgeInvalidLocks(locks) {
  const clean = {};
  Object.entries(locks).forEach(([id, timestamp]) => {
    if (isValidAnalysisId(id)) {
      clean[id] = timestamp;
    }
  });
  return clean;
}

// ── Lock helpers ──────────────────────────────────────────────────────────────

export function getLocks() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCKS_KEY) || '{}');
    const clean = purgeInvalidLocks(raw);
    // If we had to clean, save the cleaned version
    if (Object.keys(clean).length !== Object.keys(raw).length) {
      localStorage.setItem(LOCKS_KEY, JSON.stringify(clean));
    }
    return clean;
  } catch { 
    return {}; 
  }
}

export function isAnalysisLocked(analysisId) {
  if (!isValidAnalysisId(analysisId)) return false;
  return analysisId in getLocks();
}

export function lockAnalysis(analysisId) {
  if (!isValidAnalysisId(analysisId)) {
    console.warn('Refusing to lock invalid analysisId:', analysisId);
    return;
  }
  const locks = getLocks();
  locks[analysisId] = Date.now();
  localStorage.setItem(LOCKS_KEY, JSON.stringify(locks));
}

export function unlockAnalysis(analysisId) {
  if (!isValidAnalysisId(analysisId)) return;
  const locks = getLocks();
  delete locks[analysisId];
  localStorage.setItem(LOCKS_KEY, JSON.stringify(locks));
}

// ── Financial result ─────────────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Turn the money inputs into stored columns using the authoritative gross/fees
 * model: gross P&L is entered DIRECTLY and signed (a loss is negative), fees are
 * a positive cost, and net = gross − fees. Net P&L is authoritative, so the
 * caller reconciles the stored result from it:
 *   net > 0 → win · net < 0 → loss · net === 0 → breakeven · net == null → keep outcome.
 *
 * A win/loss with no gross stays financially INCOMPLETE (net null, not invented).
 * Break-even asserts a FLAT market (gross 0): with no money entered at all it
 * stays outcome-only (net null); but once fees are present, a scratch-at-entry
 * trade is a small realised LOSS (net = −fees) — it does NOT remain breakeven.
 * @param {{ result?: string, grossPnl?: any, fees?: any, amountRisked?: any }} input
 * @returns {{ grossPnl: number|null, fees: number|null, netPnl: number|null, amountRisked: number|null }}
 */
export function computeTradeFinancials({ result, grossPnl, fees, amountRisked } = {}) {
  const feeNum = nonNegMoney(fees);
  const riskNum = nonNegMoney(amountRisked);
  const grossNum = finiteOrNull(grossPnl);

  if (result === 'breakeven') {
    // No money at all → outcome-only breakeven (do not invent a 0 result).
    if (grossNum == null && feeNum == null) {
      return { grossPnl: null, fees: null, netPnl: null, amountRisked: riskNum };
    }
    // Flat market: gross defaults to 0, so fees make the net negative (a loss).
    const gross = grossNum ?? 0;
    return { grossPnl: gross, fees: feeNum, netPnl: computeNetPnl(gross, feeNum), amountRisked: riskNum };
  }
  if (grossNum == null) {
    // No gross P&L entered → financially incomplete (do not invent a value).
    return { grossPnl: null, fees: feeNum, netPnl: null, amountRisked: riskNum };
  }
  return { grossPnl: round2(grossNum), fees: feeNum, netPnl: computeNetPnl(grossNum, feeNum), amountRisked: riskNum };
}

/**
 * Build the REALISED-trade DB columns shared by every write path (quick/detailed
 * completion, "Add result", journal edit) so no two paths can store different
 * financial meanings. Produces only realised fields — never engine-snapshot
 * columns — so callers that edit an existing trade cannot touch its frozen
 * analysis. The persisted `result` is reconciled against net P&L (net is
 * authoritative when present; otherwise the selected outcome stands).
 * @param {any} details
 * @returns {Record<string, any>}
 */
export function buildRealisedFields(details = {}) {
  const { grossPnl, fees, netPnl, amountRisked } = computeTradeFinancials({
    result: details.result,
    grossPnl: details.grossPnl,
    fees: details.fees,
    amountRisked: details.amountRisked,
  });
  const result = reconcileResult(details.result, netPnl).result;
  return {
    result,
    gross_pnl:       grossPnl,
    fees,
    net_pnl:         netPnl,
    amount_risked:   amountRisked,
    pnl:             netPnl, // legacy mirror kept in sync on every write
    account_id:      details.accountId || null,
    trade_direction: normalizeTradeDirection(details.tradeDirection),
    position_size:   nonNegMoney(details.positionSize),
    points_pips:     finiteOrNull(details.pointsPips),
    split_count:     normalizeSplitCount(details.splitCount),
    mood:            normalizeMood(details.mood),
    reason_tags:     details.reasonTags == null ? null : normalizeReasonTags(details.reasonTags),
    notes:           details.notes || null,
    exit_reason:     details.exitReason || null,
    entry_price:     details.entry ? parseFloat(details.entry) : null,
    exit_price:      details.exit ? parseFloat(details.exit) : null,
    screenshot_url:  details.screenshotUrl || null,
    broker_evidence: details.brokerEvidence || null,
  };
}

/**
 * Find an existing NON-archived completed trade for an analysis session. Used for
 * duplicate protection keyed on the stable analysis_id. Tolerant of a data layer
 * without `filter` (returns null → caller inserts).
 * @param {string} analysisId
 * @returns {Promise<any|null>}
 */
async function findCompletedByAnalysisId(analysisId) {
  if (!analysisId) return null;
  try {
    const rows = await base44.entities.CompletedTrade.filter(
      { analysis_id: analysisId, status: 'completed' }, '-completed_at', 1
    );
    return rows && rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

// ── Main completion function ──────────────────────────────────────────────────

/**
 * completeTrade(analysis, result, details?)
 *
 * 1. Save to DB first
 * 2. Lock the analysisId
 * 3. Return the saved record
 *
 * NOTE: Active removal is handled by Dashboard after the modal closes
 */
export async function completeTrade(analysis, result, details = {}) {
  const { instrument, results, targetInfo, inputs, extraCheck, timestamp, analysisId } = analysis || {};
  if (!instrument) throw new Error('No instrument on analysis');
  if (!result)     throw new Error('No result provided');

  const id = analysisId || generateAnalysisId(instrument);

  // Realised-trade columns, built via the SHARED model so quick and detailed
  // completion (and later edits) always store identical financial meanings.
  const realised = buildRealisedFields({ ...details, result });

  const alignment = calcAlignment(results || {});

  // Immutable engine snapshot. Built once here so every completion route persists
  // an identical snapshot structure. Uses the resolved options the analysis was
  // computed with — never the user's current settings — so this record is frozen.
  const snapshot = createEngineSnapshot(results || {}, results?.resolvedOptions, {
    extraCheck: extraCheck || null,
    timestamp: timestamp || null,
  });

  // Engine-analysis fields — written ONLY on insert, never on the duplicate-guard
  // update path, so an already-recorded analysis is never re-graded.
  const engineFields = {
    instrument,
    // Link back to the analysis session so other devices hide this analysis on
    // the Summary instead of resurrecting it during hydration (see biasSync).
    analysis_id:      id,
    status:           'completed',
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
    // Immutable engine snapshot (migration 0005).
    engine_version:      snapshot.engine_version,
    engine_settings:     snapshot.engine_settings,
    raw_grade:           snapshot.raw_grade,
    buy_score:           snapshot.buy_score,
    sell_score:          snapshot.sell_score,
    timeframes_snapshot: snapshot.timeframes,
    lights_result:       snapshot.lights_result,
    created_at:          timestamp || new Date().toISOString(),
  };

  // Duplicate protection: an analysis session maps to at most one completed
  // trade. If this stable analysis_id already has a non-archived completed row,
  // UPDATE its realised fields instead of inserting a second row — completing the
  // same analysis twice must never silently create a duplicate. The engine
  // snapshot is deliberately not part of the update, so it stays frozen.
  const existing = await findCompletedByAnalysisId(id);
  const record = existing
    ? await base44.entities.CompletedTrade.update(existing.id, {
        ...realised,
        completed_at: existing.completed_at || new Date().toISOString(),
      })
    : await base44.entities.CompletedTrade.create({
        ...engineFields,
        ...realised,
        completed_at: new Date().toISOString(),
      });

  // Lock this analysisId
  lockAnalysis(id);

  return record;
}

/**
 * Update the REALISED fields of an existing completed trade (journal edit / "Add
 * result"). Writes only realised columns via the shared model, so the immutable
 * engine snapshot is never recalculated or overwritten, and always updates the
 * intended row by id — an edit can never create a new trade.
 * @param {string} id  the completed_trade id
 * @param {any} details  realised-field inputs (see buildRealisedFields)
 * @returns {Promise<any>} the updated record
 */
export async function updateCompletedTrade(id, details = {}) {
  if (!id) throw new Error('No trade id');
  const patch = buildRealisedFields(details);
  if (details.completedAt) patch.completed_at = details.completedAt;
  return base44.entities.CompletedTrade.update(id, patch);
}

/**
 * resolveAnalysisIdForEdit(existingId, isLoading, instrument)
 *
 * Decides which analysisId the Bias Tool should persist an instrument under.
 *   - No existing analysis                → fresh id (a brand-new analysis).
 *   - Existing id is completed (locked)
 *     AND this is a genuine user edit     → fresh id: a completed trade must not be
 *                                            edited in place, so editing starts a new
 *                                            analysis and it reappears on the Summary.
 *   - Otherwise                           → keep the existing id (a plain load/view,
 *                                            or an in-progress analysis).
 *
 * Returns { analysisId, isNew }. `isNew` signals the caller to also reset the
 * analysis timestamp so the fresh analysis is dated to now.
 */
export function resolveAnalysisIdForEdit(existingId, isLoading, instrument) {
  const startNew = Boolean(existingId) && isAnalysisLocked(existingId) && !isLoading;
  const isNew = startNew || !existingId;
  return {
    analysisId: isNew ? generateAnalysisId(instrument) : existingId,
    isNew,
  };
}

/**
 * buildRestoredAnalysis(trade)
 * Builds the active-store entry for a completed trade being restored to the Summary.
 * A fresh, valid analysisId is essential: the Dashboard filters active analyses by
 * `!isAnalysisLocked(analysisId)` and completion locks are keyed by analysisId, so a
 * restored card must carry one or it can never be cleared by completing it (and each
 * completion would insert a duplicate trade record).
 */
export function buildRestoredAnalysis(trade) {
  return {
    instrument: trade.instrument,
    analysisId: generateAnalysisId(trade.instrument),
    inputs: trade.inputs_snapshot || {},
    timestamp: trade.created_at,
    extraCheck: { h1: trade.extra_check_h1 ?? null, m15: trade.extra_check_m15 ?? null },
  };
}

/**
 * removeCompletedActiveAnalysis(analysis)
 * Removes a completed analysis from primebias_active storage.
 * Should be called AFTER navigation is complete.
 */
export function removeCompletedActiveAnalysis(analysis) {
  const { instrument, analysisId } = analysis || {};
  if (!instrument || !analysisId) return;

  const activeBefore = JSON.parse(localStorage.getItem(ACTIVE_KEY) || '{}');
  const active = structuredClone(activeBefore);

  if (active[instrument]) {
    const analyses = Array.isArray(active[instrument])
      ? active[instrument].filter(a => a.analysisId !== analysisId)
      : active[instrument].analysisId === analysisId ? [] : [active[instrument]];

    if (analyses.length === 0) {
      delete active[instrument];
    } else if (analyses.length === 1) {
      active[instrument] = analyses[0];
    } else {
      active[instrument] = analyses;
    }
  }

  localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
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
 * Generate a unique analysis ID with proper format
 * Format: INSTRUMENT-YYYY-MM-DD-HHMMSS-randomsuffix
 */
export function generateAnalysisId(instrument) {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const time = now.toISOString().split('T')[1].split('.')[0].replace(/:/g, ''); // HHMMSS
  const rand = Math.random().toString(36).substring(2, 8);
  const id = `${instrument}-${date}-${time}-${rand}`;
  
  // Validate our own output
  if (!isValidAnalysisId(id)) {
    console.error('Generated invalid analysisId:', id);
  }
  
  return id;
}