// Cross-device hydration for active (in-progress) bias analyses.
//
// The Summary and Bias Tool render from localStorage (`primebias_active` /
// `primebias_inputs`) so they stay instant and work offline. That local store is
// a CACHE — the source of truth is Supabase. This module pulls the user's active
// analyses down from Supabase and merges them into the local cache so a second
// device (same account) shows the same data instead of an empty state.
//
// Merge rules:
//   * Only rows that carry raw `inputs` are hydratable (a Summary card is
//     computed from inputs). Legacy summary-only rows are ignored.
//   * An analysis that was completed on another device (its analysis_id appears
//     in completed_trade) is NOT resurrected — instead its completion lock is
//     recreated locally so the Summary hides it, exactly as on the origin device.
//   * Last-write-wins per instrument: a newer local edit (e.g. made offline) is
//     kept over an older server copy; otherwise the server copy wins.
//
// Everything here is best-effort and never throws to its caller: a sync failure
// must not block the app from loading its local cache.
import { base44 } from '@/api/base44Client';
import { isSupabaseConfigured } from '@/api/supabaseClient';
import { isAnalysisLocked, lockAnalysis } from '@/lib/tradeCompletion';
import { syncLog, syncWarn, syncError } from '@/lib/syncLog';

const ACTIVE_KEY = 'primebias_active';
const INPUT_KEY = 'primebias_inputs';

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Parse an ISO/date-ish string to epoch ms for last-write-wins comparison.
function ts(value) {
  const n = value ? Date.parse(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

// The recency of a server row, preferring the client-supplied analysis timestamp
// and falling back to DB bookkeeping columns.
function rowRecency(row) {
  return Math.max(ts(row?.timestamp), ts(row?.updated_date), ts(row?.created_date));
}

/**
 * Pull the signed-in user's active analyses from Supabase into the local cache.
 *
 * @returns {Promise<{ ok: boolean, reason?: string, fetched?: number, hydrated?: number, keptLocal?: number, completed?: number, skippedNoInputs?: number }>}
 */
export async function hydrateActiveAnalyses() {
  if (!isSupabaseConfigured) {
    syncWarn('hydrate', 'Supabase not configured — skipping hydration (using local cache only).');
    return { ok: false, reason: 'not_configured' };
  }

  // 1. Confirm we're authenticated and log WHICH user we're querying as — this is
  //    the answer to "is the second device querying the correct user_id?".
  let user;
  try {
    user = await base44.auth.me();
    syncLog('auth', `Hydrating as user_id=${user?.id} (${user?.email ?? 'no email'}).`);
  } catch (err) {
    syncWarn('hydrate', 'Not authenticated — skipping hydration.', err?.message || err);
    return { ok: false, reason: 'not_authenticated' };
  }

  // 2. Fetch active analyses + the set of analyses already completed (so we don't
  //    resurrect them). RLS scopes both queries to auth.uid() automatically.
  let rows = [];
  let completedRows = [];
  try {
    syncLog('fetch', 'Querying bias_analysis + completed_trade …');
    [rows, completedRows] = await Promise.all([
      base44.entities.BiasAnalysis.list('-updated_date', 500),
      base44.entities.CompletedTrade.filter({ status: 'completed' }, '-completed_at', 1000),
    ]);
    syncLog('fetch', `Fetched ${rows.length} bias_analysis row(s), ${completedRows.length} completed trade(s).`);
  } catch (err) {
    syncError('fetch', 'Failed to fetch analyses from Supabase.', err?.message || err);
    return { ok: false, reason: 'fetch_failed' };
  }

  const completedIds = new Set(
    completedRows.map((t) => t?.analysis_id).filter(Boolean)
  );

  const active = readJson(ACTIVE_KEY);
  const inputStore = readJson(INPUT_KEY);

  // 3. Reduce server rows to the most-recent active candidate per instrument.
  const bestByInstrument = new Map(); // instrument -> row
  let completed = 0;
  let skippedNoInputs = 0;

  for (const row of rows) {
    const instrument = row?.instrument;
    const analysisId = row?.analysis_id;
    if (!instrument) continue;

    // Completed elsewhere → recreate the lock locally, never show it as active.
    if (analysisId && completedIds.has(analysisId)) {
      if (!isAnalysisLocked(analysisId)) lockAnalysis(analysisId);
      completed++;
      continue;
    }

    // Only rows with raw inputs can rebuild a Summary card.
    if (!row?.inputs || typeof row.inputs !== 'object') {
      skippedNoInputs++;
      continue;
    }

    const prev = bestByInstrument.get(instrument);
    if (!prev || rowRecency(row) > rowRecency(prev)) {
      bestByInstrument.set(instrument, row);
    }
  }

  // 4. Merge each candidate into the local cache (last-write-wins).
  let hydrated = 0;
  let keptLocal = 0;

  for (const [instrument, row] of bestByInstrument) {
    // A locally-known completion always wins (don't un-hide a completed card).
    if (row.analysis_id && isAnalysisLocked(row.analysis_id)) {
      completed++;
      continue;
    }

    const localEntry = active[instrument];
    const localIsNewer = localEntry && ts(localEntry.timestamp) > rowRecency(row);
    if (localIsNewer) {
      keptLocal++;
      continue;
    }

    const extraCheck = row.extra_check && typeof row.extra_check === 'object'
      ? row.extra_check
      : { h1: null, m15: null };

    active[instrument] = {
      instrument,
      analysisId: row.analysis_id || localEntry?.analysisId,
      inputs: row.inputs,
      extraCheck,
      // Pages recompute results from inputs on load; keep the server copy as a
      // fallback so a card renders even before the first recompute.
      results: row.results ?? localEntry?.results ?? null,
      timestamp: row.timestamp || row.updated_date || row.created_date || new Date().toISOString(),
      // ATR / target aren't persisted server-side; preserve any local values.
      atr: localEntry?.atr ?? null,
      targetInfo: localEntry?.targetInfo ?? null,
    };
    inputStore[instrument] = { inputs: row.inputs, extraCheck };
    hydrated++;
  }

  writeJson(ACTIVE_KEY, active);
  writeJson(INPUT_KEY, inputStore);

  // 5. Wake the Summary / Bias Tool / Engine, which re-read the cache on this event.
  window.dispatchEvent(new Event('biasUpdated'));

  const summary = {
    ok: true,
    fetched: rows.length,
    hydrated,
    keptLocal,
    completed,
    skippedNoInputs,
  };
  syncLog('hydrate', 'Hydration complete.', summary);
  return summary;
}

// Ensure hydration runs at most once per page load per user, even though
// onAuthStateChange can fire repeatedly (token refresh, focus, etc.).
let hydratedForUser = null;

/**
 * Idempotent per-load entry point used from the auth layer.
 * @param {string|undefined} userId
 */
export function hydrateOnceForUser(userId) {
  if (!userId) return;
  if (hydratedForUser === userId) return;
  hydratedForUser = userId;
  hydrateActiveAnalyses().catch((err) => {
    // hydrateActiveAnalyses already swallows its own errors; this is a backstop.
    syncError('hydrate', 'Unexpected hydration error.', err?.message || err);
    hydratedForUser = null; // allow a later retry
  });
}

/** Test/utility hook: forget the once-per-load guard. */
export function resetHydrationGuard() {
  hydratedForUser = null;
}
