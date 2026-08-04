/**
 * Single source of truth for trade completion.
 * Locks are keyed by analysisId (not instrument), so multiple analyses of the same instrument work.
 */
import { base44 } from '@/api/base44Client';
import { calcAlignment } from '@/lib/alignmentUtils';
import { createEngineSnapshot } from '@/lib/biasEngine';

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

function toNonNegNumber(v) {
  if (v == null || v === '') return null;
  const n = Math.abs(parseFloat(v));
  return Number.isFinite(n) ? n : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Turn the quick-entry inputs into stored money columns. The user always enters
 * a POSITIVE magnitude; the sign comes from the outcome, so nobody types a minus:
 *   - win        → gross = +amount
 *   - loss       → gross = −amount
 *   - breakeven  → gross = 0 (amount ignored)
 * net = gross − fees. When a win/loss has no amount entered the result is left
 * financially INCOMPLETE (net_pnl = null) rather than invented. `not_taken` and
 * unknown outcomes carry no financials.
 * @param {{ result?: string, amount?: any, fees?: any, amountRisked?: any }} input
 * @returns {{ grossPnl: number|null, fees: number|null, netPnl: number|null, amountRisked: number|null }}
 */
export function computeTradeFinancials({ result, amount, fees, amountRisked } = {}) {
  const feeNum = toNonNegNumber(fees);
  const riskNum = toNonNegNumber(amountRisked);
  const amtNum = toNonNegNumber(amount);

  if (result === 'breakeven') {
    const gross = 0;
    return { grossPnl: gross, fees: feeNum, netPnl: round2(gross - (feeNum ?? 0)), amountRisked: riskNum };
  }
  if (result === 'win' || result === 'loss') {
    if (amtNum == null) {
      // No monetary amount → financially incomplete (do not invent a value).
      return { grossPnl: null, fees: feeNum, netPnl: null, amountRisked: riskNum };
    }
    const gross = result === 'loss' ? -amtNum : amtNum;
    return { grossPnl: round2(gross), fees: feeNum, netPnl: round2(gross - (feeNum ?? 0)), amountRisked: riskNum };
  }
  return { grossPnl: null, fees: null, netPnl: null, amountRisked: riskNum };
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

  // Realised money result. The user enters positive magnitudes; sign + net are
  // derived here so no minus symbols are ever required in the UI.
  const { grossPnl, fees, netPnl, amountRisked } = computeTradeFinancials({
    result,
    amount: details.amount,
    fees: details.fees,
    amountRisked: details.amountRisked,
  });

  // Save to DB
  const alignment = calcAlignment(results || {});

  // Immutable engine snapshot. Built once here so BOTH the quick and detailed
  // completion modals (which both route through completeTrade) persist an
  // identical snapshot structure. Uses the resolved options the analysis was
  // computed with — never the user's current settings — so this record is frozen.
  const snapshot = createEngineSnapshot(results || {}, results?.resolvedOptions, {
    extraCheck: extraCheck || null,
    timestamp: timestamp || null,
  });

  const record = await base44.entities.CompletedTrade.create({
    instrument,
    // Link back to the analysis session so other devices hide this analysis on
    // the Summary instead of resurrecting it during hydration (see biasSync).
    // Requires migration 0003 (completed_trade.analysis_id).
    analysis_id: id,
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
    // Immutable engine snapshot (migration 0005). These freeze the exact ruleset
    // and settings used, so this trade is never re-graded by later settings.
    engine_version:      snapshot.engine_version,
    engine_settings:     snapshot.engine_settings,
    raw_grade:           snapshot.raw_grade,
    buy_score:           snapshot.buy_score,
    sell_score:          snapshot.sell_score,
    timeframes_snapshot: snapshot.timeframes,
    lights_result:       snapshot.lights_result,
    created_at:       timestamp || new Date().toISOString(),
    completed_at:     new Date().toISOString(),
    entry_price:      details.entry   ? parseFloat(details.entry)   : null,
    exit_price:       details.exit    ? parseFloat(details.exit)    : null,
    // Account-led financial result. `net_pnl` is authoritative; `pnl` is kept in
    // sync so any legacy reader still sees the same number.
    account_id:       details.accountId || null,
    gross_pnl:        grossPnl,
    fees,
    net_pnl:          netPnl,
    amount_risked:    amountRisked,
    pnl:              netPnl,
    exit_reason:      details.exitReason || null,
    notes:            details.notes       || null,
    screenshot_url:   details.screenshotUrl || null,
  });

  // Lock this analysisId
  lockAnalysis(id);

  return record;
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