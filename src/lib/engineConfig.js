// Single source of truth for engine-version identity and the current-engine
// filter that every NORMAL-USER performance statistic must apply.
//
// Why this module exists:
//   * The current engine version is defined here ONCE (CURRENT_ENGINE_VERSION)
//     instead of being repeated as a hard-coded string across components.
//   * `biasEngine.js` re-exports it as `ENGINE_VERSION` (the value stamped onto
//     every newly completed trade), so the constant the engine writes and the
//     constant the stats read can never drift apart.
//   * Records produced by an obsolete ruleset (legacy pre-snapshot trades, or a
//     superseded experimental version) are NEVER deleted, but they are excluded
//     from current performance statistics — mixing two rulesets' grades, scores
//     and win-rates is meaningless. History pages still show every record.
//
// Kept intentionally dependency-light (only the legacy sentinel from
// tradeCompat) so importing the current-engine filter never pulls the whole
// bias engine into a bundle.

import { LEGACY_ENGINE_VERSION } from './tradeCompat';

// Stable identifier of the locked, workbook-verified Prime Bias ruleset.
//
// `prime-bias-current-v1` allowed runtime changes to score weights, grade
// thresholds and advanced logic. Even when users left those controls at their
// defaults, that version could not guarantee that two trades were produced by
// identical maths. The production engine is now immutable: any future change to
// weights, thresholds, block rules or grading must happen deliberately in code,
// be regression-tested, and receive a new engine version.
export const CURRENT_ENGINE_VERSION = 'prime-bias-locked-v1';

// Re-exported for callers that only need the legacy sentinel alongside the
// current version, so both live behind one import.
export { LEGACY_ENGINE_VERSION };

/**
 * Engine version stamped on a trade, treating a missing value as the legacy
 * pre-snapshot ruleset. Mirrors the read-time default `normalizeTrade` applies.
 * @param {any} trade
 * @returns {string}
 */
export const engineVersionOf = (trade) => trade?.engine_version || LEGACY_ENGINE_VERSION;

/**
 * True ONLY for trades produced by the current authoritative engine. Any other
 * value — legacy pre-snapshot, or a superseded experimental version — is false.
 * @param {any} trade
 * @returns {boolean}
 */
export const isCurrentEngineTrade = (trade) => engineVersionOf(trade) === CURRENT_ENGINE_VERSION;

/**
 * Keep only current-engine trades. This is the one filter every normal-user
 * performance statistic applies so obsolete records can never be mixed into
 * current-engine metrics. Records are excluded, never deleted — they remain in
 * history and in the admin engine-version diagnostics.
 * @param {any[]} trades
 * @returns {any[]}
 */
export const filterCurrentEngine = (trades = []) => trades.filter(isCurrentEngineTrade);