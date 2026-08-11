// Single source of truth for engine-version identity and the current-engine
// filter that every NORMAL-USER performance statistic must apply.
//
// Prime Bias engine versions are deliberately immutable. The current version
// is audited formula-by-formula against the canonical Scruff Plus Tools
// "Prime Bias.xlsx" workbook. Any future maths change must receive another
// version bump so performance data from different rulesets can never be mixed.

import { LEGACY_ENGINE_VERSION } from './tradeCompat';

export const CURRENT_ENGINE_VERSION = 'prime-bias-excel-canonical-v4';

export { LEGACY_ENGINE_VERSION };

export const engineVersionOf = (trade) => trade?.engine_version || LEGACY_ENGINE_VERSION;
export const isCurrentEngineTrade = (trade) => engineVersionOf(trade) === CURRENT_ENGINE_VERSION;
export const filterCurrentEngine = (trades = []) => trades.filter(isCurrentEngineTrade);
