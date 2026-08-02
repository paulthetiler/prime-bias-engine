// Auto-save persistence for the Bias Tool's running "analysis log".
//
// A single deterministic upsert keyed by (user_id, analysis_id). Because the
// database decides whether the row already exists (unique index — migration
// 0002), calling this repeatedly for the same analysis session always targets
// the SAME row, and retrying after a failure can never create a duplicate.
// There is intentionally no insert-after-failed-update fallback.
import { base44 } from '@/api/base44Client';

export const AUTOSAVE_CONFLICT_KEY = 'user_id,analysis_id';

/**
 * @param {Record<string, any>} payload must include `analysis_id`
 * @returns {Promise<any>} the saved row
 */
export function saveBiasAnalysis(payload) {
  return base44.entities.BiasAnalysis.upsert(payload, { onConflict: AUTOSAVE_CONFLICT_KEY });
}
