// Auto-save persistence for the Bias Tool's running "analysis log".
//
// A single deterministic upsert keyed by (user_id, analysis_id). Because the
// database decides whether the row already exists (unique index — migration
// 0002), calling this repeatedly for the same analysis session always targets
// the SAME row, and retrying after a failure can never create a duplicate.
// There is intentionally no insert-after-failed-update fallback.
import { base44 } from '@/api/base44Client';

export const AUTOSAVE_CONFLICT_KEY = 'user_id,analysis_id';

// Backoff schedule (ms) between retry attempts. Its length + 1 is the attempt
// count: [1s, 2s, 4s] → up to 4 tries over ~7s before giving up. Tuned for the
// short mobile/roaming drop-outs that were leaving the tool stuck on "Not saved".
const DEFAULT_BACKOFF_MS = [1000, 2000, 4000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {Record<string, any>} payload must include `analysis_id`
 * @returns {Promise<any>} the saved row
 */
export function saveBiasAnalysis(payload) {
  return base44.entities.BiasAnalysis.upsert(payload, { onConflict: AUTOSAVE_CONFLICT_KEY });
}

/**
 * Idempotent auto-save with automatic retry for transient failures.
 *
 * Because saveBiasAnalysis is a deterministic upsert on (user_id, analysis_id),
 * re-sending the SAME payload can never create a duplicate row — so a brief
 * network drop-out self-heals on the next attempt instead of stranding the user
 * on "Not saved". Only when every attempt fails does the error surface (and the
 * caller can still offer a manual retry).
 *
 * @param {Record<string, any>} payload must include `analysis_id`
 * @param {{ backoffMs?: number[], sleepFn?: (ms: number) => Promise<void>, onRetry?: (attempt: number, err: any) => void }} [options]
 * @returns {Promise<any>} the saved row
 */
export async function saveBiasAnalysisWithRetry(payload, options = {}) {
  const { backoffMs = DEFAULT_BACKOFF_MS, sleepFn = sleep, onRetry } = options;
  const maxAttempts = backoffMs.length + 1;
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await saveBiasAnalysis(payload);
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts - 1) break;
      onRetry?.(attempt + 1, err);
      await sleepFn(backoffMs[attempt]);
    }
  }
  throw lastErr;
}
