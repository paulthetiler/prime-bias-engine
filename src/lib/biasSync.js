// Two-way cross-device sync for active (in-progress) bias analyses.
//
// The Summary and Bias Tool render from localStorage (`primebias_active` /
// `primebias_inputs`) so they stay instant and work offline. That local store is
// a CACHE — the source of truth is Supabase. On sign-in we reconcile the two:
//
//   PUSH — upload local analyses the server is missing (or that were saved
//          before the DB was set up, so the server row has no `inputs`, or that
//          were edited more recently offline). This is what carries an analysis
//          created on one device up to the account.
//   PULL — merge the server's analyses down into the local cache so this device
//          shows the same data the analysis was created on.
//
// Merge rules:
//   * Only rows/entries that carry raw `inputs` are syncable (a Summary card is
//     computed from inputs). Legacy summary-only rows are ignored.
//   * An analysis completed on another device (its analysis_id appears in
//     completed_trade) is never resurrected — its completion lock is recreated
//     locally so the Summary hides it, exactly as on the origin device.
//   * Last-write-wins per instrument: a newer local edit is kept/pushed over an
//     older server copy; otherwise the server copy wins.
//
// Everything here is best-effort and never throws to its caller: a sync failure
// must not block the app from loading its local cache.
import { base44 } from '@/api/base44Client';
import { isSupabaseConfigured } from '@/api/supabaseClient';
import { isAnalysisLocked, lockAnalysis } from '@/lib/tradeCompletion';
import { saveBiasAnalysis, buildBiasAnalysisPayload } from '@/lib/autoSave';
import { calculateBias, engineOptionsFromSettings } from '@/lib/biasEngine';
import { getSettings } from '@/lib/userSettings';
import { syncLog, syncWarn, syncError } from '@/lib/syncLog';

const ACTIVE_KEY = 'primebias_active';
const INPUT_KEY = 'primebias_inputs';

// Only push when a local edit is at least this much newer than the server copy,
// so millisecond skew between a save's local timestamp and its DB timestamp
// doesn't cause a redundant re-upload of an already-synced analysis.
const PUSH_SKEW_MS = 2000;

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

function hasInputs(obj) {
  return Boolean(obj?.inputs) && typeof obj.inputs === 'object';
}

// A local active entry may (defensively) be an array of analyses per instrument.
function entriesFor(value) {
  return Array.isArray(value) ? value : [value];
}

// ── Server state ────────────────────────────────────────────────────────────

async function resolveUser() {
  try {
    const user = await base44.auth.me();
    syncLog('auth', `Syncing as user_id=${user?.id} (${user?.email ?? 'no email'}).`);
    return user;
  } catch (err) {
    syncWarn('sync', 'Not authenticated — skipping sync.', err?.message || err);
    return null;
  }
}

async function fetchServerState() {
  syncLog('fetch', 'Querying bias_analysis + completed_trade …');
  const [rows, completedRows] = await Promise.all([
    base44.entities.BiasAnalysis.list('-updated_date', 500),
    base44.entities.CompletedTrade.filter({ status: 'completed' }, '-completed_at', 1000),
  ]);
  syncLog('fetch', `Fetched ${rows.length} bias_analysis row(s), ${completedRows.length} completed trade(s).`);
  const completedIds = new Set(completedRows.map((t) => t?.analysis_id).filter(Boolean));
  const rowsById = new Map(rows.filter((r) => r?.analysis_id).map((r) => [r.analysis_id, r]));
  return { rows, completedIds, rowsById };
}

// ── PUSH: local → server ──────────────────────────────────────────────────────

async function pushFrom({ rowsById, completedIds }) {
  const active = readJson(ACTIVE_KEY);
  const opts = engineOptionsFromSettings(getSettings());
  let pushed = 0;
  let skipped = 0;
  let failed = 0;

  for (const [instrument, value] of Object.entries(active)) {
    for (const entry of entriesFor(value)) {
      const analysisId = entry?.analysisId;
      if (!analysisId || !hasInputs(entry)) {
        skipped++;
        continue;
      }
      // Never re-upload something already completed (here or elsewhere).
      if (isAnalysisLocked(analysisId) || completedIds.has(analysisId)) {
        skipped++;
        continue;
      }

      const serverRow = rowsById.get(analysisId);
      const localNewer = ts(entry.timestamp) > rowRecency(serverRow) + PUSH_SKEW_MS;
      const shouldPush = !serverRow || !hasInputs(serverRow) || localNewer;
      if (!shouldPush) {
        skipped++;
        continue;
      }

      try {
        // Recompute results from inputs so the pushed row matches current settings.
        const results = calculateBias(entry.inputs, entry.extraCheck || null, opts);
        const payload = buildBiasAnalysisPayload({
          analysisId,
          instrument: entry.instrument || instrument,
          inputs: entry.inputs,
          extraCheck: entry.extraCheck || { h1: null, m15: null },
          results,
          timestamp: entry.timestamp,
        });
        await saveBiasAnalysis(payload);
        pushed++;
        syncLog('push', `Pushed ${instrument} (${analysisId}) ✓`);
      } catch (err) {
        failed++;
        syncError('push', `Failed to push ${instrument} (${analysisId}).`, err?.message || err);
      }
    }
  }

  syncLog('push', 'Push complete.', { pushed, skipped, failed });
  return { pushed, skipped, failed };
}

// ── PULL: server → local ──────────────────────────────────────────────────────

function pullInto({ rows, completedIds }) {
  const active = readJson(ACTIVE_KEY);
  const inputStore = readJson(INPUT_KEY);

  // Reduce server rows to the most-recent active candidate per instrument.
  const bestByInstrument = new Map();
  let completed = 0;
  let skippedNoInputs = 0;

  for (const row of rows) {
    const instrument = row?.instrument;
    const analysisId = row?.analysis_id;
    if (!instrument) continue;

    if (analysisId && completedIds.has(analysisId)) {
      if (!isAnalysisLocked(analysisId)) lockAnalysis(analysisId);
      completed++;
      continue;
    }

    if (!hasInputs(row)) {
      skippedNoInputs++;
      continue;
    }

    const prev = bestByInstrument.get(instrument);
    if (!prev || rowRecency(row) > rowRecency(prev)) {
      bestByInstrument.set(instrument, row);
    }
  }

  let hydrated = 0;
  let keptLocal = 0;

  for (const [instrument, row] of bestByInstrument) {
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
      results: row.results ?? localEntry?.results ?? null,
      timestamp: row.timestamp || row.updated_date || row.created_date || new Date().toISOString(),
      atr: localEntry?.atr ?? null,
      targetInfo: localEntry?.targetInfo ?? null,
    };
    inputStore[instrument] = { inputs: row.inputs, extraCheck };
    hydrated++;
  }

  writeJson(ACTIVE_KEY, active);
  writeJson(INPUT_KEY, inputStore);
  window.dispatchEvent(new Event('biasUpdated'));

  return { hydrated, keptLocal, completed, skippedNoInputs };
}

// ── Public entry points ───────────────────────────────────────────────────────

/**
 * Full two-way reconcile: push local-only/newer analyses up, then pull the
 * server's active set down into the local cache.
 */
export async function syncActiveAnalyses() {
  if (!isSupabaseConfigured) {
    syncWarn('sync', 'Supabase not configured — skipping sync (using local cache only).');
    return { ok: false, reason: 'not_configured' };
  }
  const user = await resolveUser();
  if (!user) return { ok: false, reason: 'not_authenticated' };

  let server;
  try {
    server = await fetchServerState();
  } catch (err) {
    syncError('fetch', 'Failed to fetch analyses from Supabase.', err?.message || err);
    return { ok: false, reason: 'fetch_failed' };
  }

  const push = await pushFrom(server);
  const pull = pullInto({ rows: server.rows, completedIds: server.completedIds });

  const summary = { ok: true, fetched: server.rows.length, pushed: push.pushed, ...pull };
  syncLog('sync', 'Sync complete.', summary);
  return summary;
}

/**
 * Pull-only hydration (server → local). Kept as a focused entry point.
 * @returns {Promise<{ ok: boolean, reason?: string, fetched?: number, hydrated?: number, keptLocal?: number, completed?: number, skippedNoInputs?: number }>}
 */
export async function hydrateActiveAnalyses() {
  if (!isSupabaseConfigured) {
    syncWarn('hydrate', 'Supabase not configured — skipping hydration (using local cache only).');
    return { ok: false, reason: 'not_configured' };
  }
  const user = await resolveUser();
  if (!user) return { ok: false, reason: 'not_authenticated' };

  let server;
  try {
    server = await fetchServerState();
  } catch (err) {
    syncError('fetch', 'Failed to fetch analyses from Supabase.', err?.message || err);
    return { ok: false, reason: 'fetch_failed' };
  }

  const pull = pullInto({ rows: server.rows, completedIds: server.completedIds });
  const summary = { ok: true, fetched: server.rows.length, ...pull };
  syncLog('hydrate', 'Hydration complete.', summary);
  return summary;
}

// Ensure sync runs at most once per page load per user, even though
// onAuthStateChange can fire repeatedly (token refresh, focus, etc.).
let syncedForUser = null;

/**
 * Idempotent per-load entry point used from the auth layer. Runs the full
 * two-way sync so a locally-created analysis is pushed up and the server's set
 * is pulled down.
 * @param {string|undefined} userId
 */
export function hydrateOnceForUser(userId) {
  if (!userId) return;
  if (syncedForUser === userId) return;
  syncedForUser = userId;
  syncActiveAnalyses().catch((err) => {
    syncError('sync', 'Unexpected sync error.', err?.message || err);
    syncedForUser = null; // allow a later retry
  });
}

/** Test/utility hook: forget the once-per-load guard. */
export function resetHydrationGuard() {
  syncedForUser = null;
}
