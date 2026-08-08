// PrimeBias Engine — ported cell-by-cell from the Excel workbook
// (tabs: "Bias Tool", B1–B4). Every rule below is transcribed from a specific
// Excel formula so the app reproduces the spreadsheet exactly.
//
// IMPORTANT: this production ruleset is intentionally IMMUTABLE. Weights,
// thresholds, block rules and grade logic cannot be changed at runtime. Any
// future maths change must be made deliberately in code, regression-tested
// against the workbook and accompanied by an engine-version bump.
//
// ── TIMEFRAME DIRECTION (Excel J = AE, driven by AD) ─────────────────────────
//   Each indicator contributes  input(-1/0/+1) × weight  (Excel cols Z..AC).
//   AD is NOT a net sum — it is the DOMINANT side:
//       AD = IF( |Σ negatives| > |Σ positives|, Σ negatives, Σ positives )
//   Direction (AE):  AD ≤ −35 → −1 (SELL) · AD ≥ 35 → +1 (BUY) · else 0 (Neutral)
//   ⇒ a single weak indicator that never reaches ±35 stays Neutral (dead-zone).
//
//   Direction weights (Excel Z13:AC19):
//     Month{c40 m30 r10 b20}  Week{c30 m40 r10 b20}  Day{c35 m25 r10 b30}
//     4hr{c25 m20 r20 b35}     1hr{c0 m20 r40 b40}
//     15m{c0 m15 r40 b45}      5m{c0 m5 r50 b45}
//
// ── BLOCKS ───────────────────────────────────────────────────────────────────
//   DEEP = [Month, Week, Day]   DD = [Day, 4hr, 1hr]   NOW = [1hr, 15m, 5m]
//   Block direction  (Excel O = MODE): the result that occurs in ≥2 of the 3
//     timeframes; if all three differ → Neutral.
//   Block strength  (Excel Q) anchors on ONE timeframe and counts how many of
//     the other two share its direction:
//       DEEP anchor = Day  ·  DD anchor = 1hr  ·  NOW anchor = 1hr
//       anchor Neutral → WEAK · both others match → STRONG · one → MEDIUM · none → WEAK
//
// ── GRADE SCORE (Excel AC33/AD33 → AB35) ─────────────────────────────────────
//   BUY vs SELL point tally, per-timeframe weights (Excel Z25:Z31):
//     Month2 Week5 Day10 4hr30 1hr33 15m10 5m5   (Extra-Check green light +5)
//   Score direction (Excel AC34): higher tally wins; tie broken by 1hr direction.
//   Winning score = the winning side's tally (Excel AB35).
//
// ── GRADE LETTER (Excel AC35, from the winning score) ────────────────────────
//     >91 → F   ≥80 → C(Risky)   ≥75 → A   ≥55 → B   ≥45 → C   ≥40 → D   <40 → D
//   (Note: below 40 the sheet returns D, NOT F.)
//
// ── GRADE CAP (Excel Q10 = IF(P9 = Q11, AC35, "C")) ──────────────────────────
//   P9 is the block-weighted trend (DEEP 10 / DD 49 / NOW 41, BUY vs SELL).
//   If that trend disagrees with the score direction, the grade is forced to C.
//
// ── EXTENDED (Excel P10: AB35 > 90 → "Extended") ─────────────────────────────
//   A winning score above 90 flags the market EXTENDED (grade F is the top score
//   band, > 91). This is a DESCRIPTIVE market state (Status), NOT a trade verdict
//   — it must never be mapped to "No Trade". The target can still be GOOD because
//   target quality is derived from the winning grade, separately from Deep/DD/Now
//   block alignment.
//
// ── ACTION / TRADE (Excel "Trade" col L16 = AC34, the score direction) ────────
//   The Trade/Action comes from the MAIN bias, exactly as the sheet does it — it
//   is NEVER gated by the Extra Check. In the workbook the Extended/F snapshot
//   shows Status "Extended", Grade "F" and Trade "BUY" at the same time as the
//   Extra Check (K12) reads "No Trade": the two are independent columns.
//     A/B/C/D grades: the Action is a readiness verdict (TRADE / WAIT) from the
//       grade plus Deep/DD/Now block alignment — the normal engine behaviour.
//     Extended / grade-F: the top score band shows its Action DIRECTIONALLY
//       (BUY / SELL) straight from the main score direction — no Extra Check
//       required, never PENDING, never forced to NO_TRADE by the Extended state.
//
// ── EXTRA CHECK (Excel K12) — a SEPARATE confirmation layer ───────────────────
//   =IF(AND(1H=-1,15M=-1),"SELL",IF(AND(1H=1,15M=1),"BUY","No Trade"))
//   Gary's Extra Check confirms (or conflicts with) the analysis already made; it
//   does NOT calculate the grade and does NOT grant permission to trade. It reads
//   the manual 1H/15M inputs and is compared against the main direction purely as
//   confirmation information (CONFIRMS / CONFLICTS / NOT CHECKED).
//
// Verified: the all-BUY snapshot saved in every workbook tab (Bias Tool, B1–B4)
// reproduces DEEP BULL/STRONG, DD BUY/STRONG, NOW BUY/STRONG, score 95, grade F,
// Status Extended, Trade BUY (workbook cells AB35=95, AC35=F, AC34/L16=BUY).

import { calcAlignment } from './alignmentUtils';
import { CURRENT_ENGINE_VERSION } from './engineConfig';

// Stable identifier of the engine implementation used to stamp every newly
// completed trade. The single source of truth lives in `engineConfig.js`
// (CURRENT_ENGINE_VERSION); it is re-exported here under the name the engine and
// its callers have always used so the value the engine writes and the value the
// stats read can never drift apart.
export const ENGINE_VERSION = CURRENT_ENGINE_VERSION;

// ─── Config ───────────────────────────────────────────────────────────────────

const TIMEFRAMES = [
  { key: 'month', label: 'Monthly',  shortLabel: 'M',   group: 'broadstroke' },
  { key: 'week',  label: 'Weekly',   shortLabel: 'W',   group: 'broadstroke' },
  { key: 'day',   label: 'Daily',    shortLabel: 'D',   group: 'broadstroke' },
  { key: 'h4',    label: '4 Hour',   shortLabel: '4H',  group: 'trigger' },
  { key: 'h1',    label: '1 Hour',   shortLabel: '1H',  group: 'trigger' },
  { key: 'm15',   label: '15 Min',   shortLabel: '15m', group: 'trigger' },
  { key: 'm5',    label: '5 Min',    shortLabel: '5m',  group: 'trigger' },
];

// Per-indicator direction weights — Excel "Bias Tool" cols Z13:AC19.
const WEIGHTS = {
  month: { close: 40, macd: 30, rsi: 10, boli: 20 },
  week:  { close: 30, macd: 40, rsi: 10, boli: 20 },
  day:   { close: 35, macd: 25, rsi: 10, boli: 30 },
  h4:    { close: 25, macd: 20, rsi: 20, boli: 35 },
  h1:    { close: 0,  macd: 20, rsi: 40, boli: 40 },
  m15:   { close: 0,  macd: 15, rsi: 40, boli: 45 },
  m5:    { close: 0,  macd: 5,  rsi: 50, boli: 45 },
};

// The ±35 dead-zone threshold applied to the dominant-side total (Excel AE).
const DIRECTION_THRESHOLD = 35;

// Grade scoring weights — Excel Z25:Z31 (BUY vs SELL point tally).
const TF_SCORE_WEIGHTS = {
  month: 2, week: 5, day: 10, h4: 30, h1: 33, m15: 10, m5: 5,
};
const LIGHTS_WEIGHT = 5;

// Block-weighted trend weights for the grade cap — Excel AH4:AH6 (P9 / AI8).
const BLOCK_TREND_WEIGHTS = { deep: 10, dd: 49, now: 41 };

// A winning score above this flags the market EXTENDED — Excel P10 (AB35 > 90).
const EXTENDED_SCORE = 90;

// ─── Assets ───────────────────────────────────────────────────────────────────
const ASSETS = [
  'AUD/CAD','AUD/CHF','AUD/JPY','AUD/NZD','AUD/USD',
  'CAD/CHF','CAD/JPY','CHF/JPY','EUR/AUD','EUR/CAD',
  'EUR/CHF','EUR/GBP','EUR/JPY','EUR/NZD','EUR/USD',
  'GBP/AUD','GBP/CAD','GBP/CHF','GBP/JPY','GBP/NZD','GBP/USD',
  'NZD/CAD','NZD/CHF','NZD/JPY','NZD/USD',
  'USD/CAD','USD/CHF','USD/JPY',
  'DAX','FTSE','DOW','SP500','US100','CAC40','JAP225',
  'GOLD','GOLD/USD','OIL','GAS','BITCOIN','ETHUSDT',
  'Copper','Aluminum','Zinc','Lead','Carbon',
  'Dollar','Hong HS50','AUD200','SMI',
];

const BASE_ATR = {
  'AUD/CAD':110,'AUD/CHF':38,'AUD/JPY':62,'AUD/NZD':43,'AUD/USD':50,
  'CAD/CHF':40,'CAD/JPY':78,'CHF/JPY':108,'EUR/AUD':91,'EUR/CAD':68,
  'EUR/CHF':40,'EUR/GBP':29,'EUR/JPY':155,'EUR/NZD':102,'EUR/USD':55,
  'GBP/AUD':107,'GBP/CAD':86,'GBP/CHF':56,'GBP/JPY':128,'GBP/NZD':126,'GBP/USD':90,
  'NZD/CAD':49,'NZD/CHF':36,'NZD/JPY':60,'NZD/USD':48,
  'USD/CAD':58,'USD/CHF':55,'USD/JPY':112,
  'DAX':161,'FTSE':60,'DOW':260,'SP500':35,'US100':178,'CAC40':74,'JAP225':476,
  'GOLD':19,'GOLD/USD':200,'OIL':111,'GAS':140,'BITCOIN':1565,'ETHUSDT':95,
  'Copper':108,'Aluminum':40,'Zinc':50,'Lead':36,'Carbon':274,
  'Dollar':50,'Hong HS50':380,'AUD200':61,'SMI':95,
};

const TARGET_WEIGHTS = { A: 1.25, B: 1.0, C: 0.75, D: 0.5 };
const TARGET_DIVISOR = 9;

// ─── Defaults ─────────────────────────────────────────────────────────────────
function getDefaultInputs() {
  const inputs = {};
  TIMEFRAMES.forEach(tf => { inputs[tf.key] = { close: 0, macd: 0, rsi: 0, boli: 0 }; });
  return inputs;
}

// ─── TF direction ─────────────────────────────────────────────────────────────
// Excel AD (dominant side) + AE (±35 dead-zone). Returns { result, total }
// where total is the signed dominant-side value (Excel AD).
function calcTFTotal(tfKey, ind) {
  const w = WEIGHTS[tfKey];
  const contribs = [ind.close * w.close, ind.macd * w.macd, ind.rsi * w.rsi, ind.boli * w.boli];
  const pos = contribs.reduce((s, v) => (v > 0 ? s + v : s), 0);
  const neg = contribs.reduce((s, v) => (v < 0 ? s + v : s), 0);
  return Math.abs(neg) > Math.abs(pos) ? neg : pos; // Excel AD
}

function calcTFResult(tfKey, ind) {
  const total = calcTFTotal(tfKey, ind);
  if (total <= -DIRECTION_THRESHOLD) return -1;
  if (total >= DIRECTION_THRESHOLD) return 1;
  return 0;
}

// ─── Block direction (Excel O = MODE) ─────────────────────────────────────────
// The result appearing in ≥2 of the 3 timeframes; all three different → Neutral.
function calcBlockDir(r0, r1, r2) {
  const arr = [r0, r1, r2];
  for (const v of [1, -1, 0]) {
    if (arr.filter(x => x === v).length >= 2) return v;
  }
  return 0; // all distinct (Excel MODE → #N/A) → treat as Neutral
}

// ─── Block strength (Excel Q) ─────────────────────────────────────────────────
// Anchors on one timeframe and counts how many of the other two match it:
//   anchor Neutral → WEAK · both match → STRONG · one matches → MEDIUM · none → WEAK
function calcAnchoredStrength(anchor, other1, other2) {
  if (anchor === 0) return 'WEAK';
  const matches = [other1, other2].filter(x => x === anchor).length;
  if (matches === 2) return 'STRONG';
  if (matches === 1) return 'MEDIUM';
  return 'WEAK';
}

// ─── Grade (Excel AC35) ───────────────────────────────────────────────────────
//   >91 → F · ≥80 → C · ≥75 → A · ≥55 → B · ≥45 → C · ≥40 → D · <40 → D
// These thresholds are part of the locked workbook ruleset and are not runtime
// configuration.
const DEFAULT_THRESHOLDS = { extended: 92, risky: 80, A: 75, B: 55, C: 45, D: 40 };

function calcGrade(score) {
  if (score >= DEFAULT_THRESHOLDS.extended) return 'F';
  if (score >= DEFAULT_THRESHOLDS.risky)    return 'C';
  if (score >= DEFAULT_THRESHOLDS.A)        return 'A';
  if (score >= DEFAULT_THRESHOLDS.B)        return 'B';
  if (score >= DEFAULT_THRESHOLDS.C)        return 'C';
  if (score >= DEFAULT_THRESHOLDS.D)        return 'D';
  return 'D'; // Excel floor is D, not F
}

function calcGradeLabel(grade, score, extendedScore = EXTENDED_SCORE) {
  if (score > extendedScore) return 'Extended';
  if (grade === 'A') return 'Very Good';
  if (grade === 'B') return 'Good';
  if (grade === 'C') return 'Risky';
  if (grade === 'D') return 'Dangerous';
  // Grade F is the top score band (a very high, "extended" score) — it is a
  // market state, never a "No Trade" verdict (that is the Extra Check's job).
  return 'Extended';
}

// ─── Target quality (Excel target-quality label) ──────────────────────────────
// The quality of the target depends on the winning GRADE only. It is deliberately
// INDEPENDENT of Deep/DD/Now block alignment and of the Extra-Check trade gate:
// a very high score (grade F / Extended) still has a strong, GOOD target — being
// "extended" is a timing risk, not a downgrade of the target itself.
function targetQuality(grade) {
  switch (grade) {
    case 'F': return 'GOOD';
    case 'A': return 'GOOD';
    case 'B': return 'MED';
    case 'C': return 'SCALP';
    case 'D': return 'SMALL';
    default:  return 'SMALL';
  }
}

// ─── Extra Check result (Excel K12) ───────────────────────────────────────────
function calcExtraCheckResult(extraCheck) {
  const h1  = extraCheck ? extraCheck.h1  : null;
  const m15 = extraCheck ? extraCheck.m15 : null;
  if (h1 == null || m15 == null) return 'NOT_CHECKED';
  if (h1 === -1 && m15 === -1)   return 'SELL';
  if (h1 === 1  && m15 === 1)    return 'BUY';
  return 'NO_TRADE';
}

function calcExtraCheckConfirmation(extraCheckResult, mainDirection) {
  if (extraCheckResult === 'NOT_CHECKED') return 'NOT_CHECKED';
  if (extraCheckResult === mainDirection) return 'CONFIRMS';
  return 'CONFLICTS';
}

// ─── Main calculation ─────────────────────────────────────────────────────────
function calculateBias(inputs, extraCheck = null, _options = {}) {
  // Runtime engine overrides are deliberately ignored. Keeping the third
  // argument preserves call-site compatibility while guaranteeing that every
  // production calculation uses exactly the same workbook-verified rules.
  const scoreWeights = TF_SCORE_WEIGHTS;
  const thresholds = DEFAULT_THRESHOLDS;

  // 1. TF directions
  const tfResults = {};
  TIMEFRAMES.forEach(tf => {
    const ind = inputs[tf.key] || { close: 0, macd: 0, rsi: 0, boli: 0 };
    const total = calcTFTotal(tf.key, ind);
    const result = total <= -DIRECTION_THRESHOLD ? -1 : total >= DIRECTION_THRESHOLD ? 1 : 0;
    tfResults[tf.key] = {
      result,
      total,
      indicators: { close: ind.close, macd: ind.macd, rsi: ind.rsi, boli: ind.boli },
      bias: result === 1 ? 'BUY' : result === -1 ? 'SELL' : 'Neutral',
    };
  });
  const r = key => tfResults[key].result;

  // 2. DEEP block [Month, Week, Day] — anchor = Day
  const deepDir      = calcBlockDir(r('month'), r('week'), r('day'));
  const deepTrend    = deepDir === 1 ? 'BULL' : deepDir === -1 ? 'BEAR' : 'NEUTRAL';
  const deepStrength = calcAnchoredStrength(r('day'), r('month'), r('week'));

  // 3. DD block [Day, 4hr, 1hr] — anchor = 1hr
  const ddDir      = calcBlockDir(r('day'), r('h4'), r('h1'));
  const ddBias     = ddDir === 1 ? 'BUY' : ddDir === -1 ? 'SELL' : 'NEUTRAL';
  const ddStrength = calcAnchoredStrength(r('h1'), r('day'), r('h4'));

  // 4. NOW block [1hr, 15m, 5m] — anchor = 1hr
  const nowDir      = calcBlockDir(r('h1'), r('m15'), r('m5'));
  const nowBias     = nowDir === 1 ? 'BUY' : nowDir === -1 ? 'SELL' : 'NEUTRAL';
  const nowStrength = calcAnchoredStrength(r('h1'), r('m15'), r('m5'));

  // 5. Grade score — canonical workbook weights only.
  let buyScore = 0, sellScore = 0;
  TIMEFRAMES.forEach(tf => {
    const res = r(tf.key);
    const w = scoreWeights[tf.key];
    if (res === 1)  buyScore  += w;
    if (res === -1) sellScore += w;
  });

  // Extra Check lights (+5 if green: h1 and m15 both same non-zero direction)
  let lightsActive = false;
  if (extraCheck && extraCheck.h1 != null && extraCheck.m15 != null &&
      extraCheck.h1 !== 0 && extraCheck.h1 === extraCheck.m15) {
    lightsActive = true;
    if (extraCheck.h1 === 1) buyScore += LIGHTS_WEIGHT;
    else sellScore += LIGHTS_WEIGHT;
  }

  // 6. Score direction = main direction (Excel AC34; tie broken by 1hr)
  let scoreDirection;
  if      (buyScore > sellScore)  scoreDirection = 'BUY';
  else if (sellScore > buyScore)  scoreDirection = 'SELL';
  else {
    if      (r('h1') === 1)  scoreDirection = 'BUY';
    else if (r('h1') === -1) scoreDirection = 'SELL';
    else                      scoreDirection = 'NEUTRAL';
  }

  const winningScore  = scoreDirection === 'BUY'  ? buyScore
                      : scoreDirection === 'SELL' ? sellScore : 0;
  const mainDirection = scoreDirection === 'NEUTRAL' ? 'BUY' : scoreDirection;
  const dir           = mainDirection === 'BUY' ? 1 : -1;

  // 7. Raw grade
  const rawGrade = calcGrade(winningScore);

  // 8. Grade cap (Excel Q10 = IF(P9 = Q11, AC35, "C")).
  const blockBuy  = (deepDir === 1 ? BLOCK_TREND_WEIGHTS.deep : 0)
                  + (ddDir   === 1 ? BLOCK_TREND_WEIGHTS.dd   : 0)
                  + (nowDir  === 1 ? BLOCK_TREND_WEIGHTS.now  : 0);
  const blockSell = (deepDir === -1 ? BLOCK_TREND_WEIGHTS.deep : 0)
                  + (ddDir   === -1 ? BLOCK_TREND_WEIGHTS.dd   : 0)
                  + (nowDir  === -1 ? BLOCK_TREND_WEIGHTS.now  : 0);
  const blockTrend = blockBuy > blockSell ? 'BUY' : blockSell > blockBuy ? 'SELL' : 'NEUTRAL';
  const trendMatchesScore = blockTrend === scoreDirection;
  const effectiveGrade = trendMatchesScore ? rawGrade : 'C';

  const deepMatchesScore =
    deepDir === 0 ||
    (deepDir === 1  && scoreDirection === 'BUY') ||
    (deepDir === -1 && scoreDirection === 'SELL');

  const nowMatchesScore = nowDir === dir;
  const ddMatchesScore  = ddDir  === dir;

  const isExtended = winningScore > EXTENDED_SCORE;

  // 9. Status — descriptive market/readiness state, never a trade prohibition.
  let status;
  if (isExtended || effectiveGrade === 'F') {
    status = 'Extended';
  } else if (effectiveGrade === 'D') {
    status = 'Dangerous';
  } else if (effectiveGrade === 'A') {
    status = nowMatchesScore ? 'Ready' : 'Trend Off';
  } else if (effectiveGrade === 'B') {
    status = nowMatchesScore ? 'Ready' : 'Monitor';
  } else {
    if (!deepMatchesScore)    status = 'Wait';
    else if (!ddMatchesScore) status = 'Trend Off';
    else                      status = 'Scalp';
  }

  const targetNote = `${targetQuality(effectiveGrade)} ${mainDirection}`;

  let tradeAction;
  if (effectiveGrade === 'F') {
    tradeAction = mainDirection;
  } else if (effectiveGrade === 'A' || effectiveGrade === 'B') {
    tradeAction = nowMatchesScore ? 'TRADE' : 'WAIT';
  } else if (effectiveGrade === 'C') {
    tradeAction = (deepMatchesScore && ddMatchesScore) ? 'TRADE' : 'WAIT';
  } else {
    tradeAction = 'WAIT';
  }

  const extraCheckResult = calcExtraCheckResult(extraCheck);
  const extraCheckConfirmation = calcExtraCheckConfirmation(extraCheckResult, mainDirection);

  // 10. Warnings
  const warnings = [];
  if (!trendMatchesScore && (deepDir !== 0 || ddDir !== 0 || nowDir !== 0))
    warnings.push('Block trend conflicts with score direction — grade capped at C');
  if (ddDir !== 0 && nowDir !== 0 && ddDir !== nowDir)
    warnings.push('NOW momentum is OPPOSITE to DD — momentum conflict');
  if (ddDir === 0)
    warnings.push('DD block is NEUTRAL — execution zone has no clear trend');
  if (deepDir === 0)
    warnings.push('Deep Trend is NEUTRAL — no macro direction confirmed');
  if (isExtended || effectiveGrade === 'F')
    warnings.push('Extended conditions — valid setup, but use extra caution');
  else if (winningScore >= 80)
    warnings.push('Score 80-90 — approaching extended territory, use caution');

  const plusMinusScore  = r('h1') + r('m15') + r('m5');
  const alignedCount    = TIMEFRAMES.filter(tf => r(tf.key) === dir).length;
  const confidenceScore = Math.round((alignedCount / TIMEFRAMES.length) * 100);
  const gradeLabel      = calcGradeLabel(effectiveGrade, winningScore);

  // Snapshot the one canonical ruleset actually applied.
  const resolvedOptions = {
    scoreWeights: { ...TF_SCORE_WEIGHTS },
    thresholds: { ...DEFAULT_THRESHOLDS },
    useM5Override: false,
    downgradeOnNowWeakness: false,
    requireAlignmentForA: false,
  };

  const lightsResult = lightsActive
    ? (extraCheck && extraCheck.h1 === 1 ? 'buy' : 'sell')
    : 'none';

  return {
    timeframes: tfResults,
    deepTrend, deepResult: deepDir, deepStrength,
    ddBias, ddResult: ddDir, ddStrength,
    nowBias, nowResult: nowDir, nowStrength,
    buyScore, sellScore, winningScore, plusMinusScore, lightsActive, lightsResult,
    mainDirection, scoreDirection,
    rawGrade, effectiveGrade, grade: effectiveGrade, gradeLabel, strength: ddStrength,
    tradeAction, status, targetNote,
    extraCheckResult, extraCheckConfirmation,
    confidenceScore, warnings,
    engineVersion: ENGINE_VERSION,
    resolvedOptions,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getATRForAsset(asset, topAssets) {
  for (const ta of topAssets) {
    if (ta.asset === asset && ta.atr) return parseFloat(ta.atr);
  }
  return BASE_ATR[asset] || 0;
}

function calculateMinSafeMove(atr, grade) {
  if (!atr) return null;
  const value = parseFloat(((atr * (TARGET_WEIGHTS[grade] || 0.5)) / TARGET_DIVISOR).toFixed(4));
  return { value, grade, target: value, targetType: grade };
}

const FOREX_CURRENCIES = new Set([
  'AUD', 'CAD', 'CHF', 'CNH', 'DKK', 'EUR', 'GBP', 'HKD', 'JPY', 'MXN',
  'NOK', 'NZD', 'PLN', 'SEK', 'SGD', 'TRY', 'USD', 'ZAR',
]);

const METAL_CURRENCIES = new Set(['XAU', 'XAG', 'XPT', 'XPD']);

function atrUnitForInstrument(instrument) {
  if (!instrument) return 'points';
  const sym = String(instrument).toUpperCase().replace(/\s+/g, '');
  const [base, quote] = sym.includes('/') ? sym.split('/') : [sym.slice(0, 3), sym.slice(3)];
  if (METAL_CURRENCIES.has(base) || METAL_CURRENCIES.has(quote)) return 'points';
  if (FOREX_CURRENCIES.has(base) && FOREX_CURRENCIES.has(quote)) return 'pips';
  return 'points';
}

function formatAtrValue(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const rounded = Math.round(Number(value) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatWithUnit(value, instrument) {
  const formatted = formatAtrValue(value);
  if (formatted == null) return null;
  const unit = atrUnitForInstrument(instrument);
  const label = formatted === '1' ? unit.slice(0, -1) : unit;
  return `${formatted} ${label}`;
}

// Legacy compatibility for callers that still ask the Settings object for engine
// options. Returning an empty object is intentional: runtime settings cannot
// alter Prime Bias maths anymore.
function engineOptionsFromSettings(_settings) {
  return {};
}

/**
 * Build the immutable engine snapshot persisted with a completed trade.
 * The snapshot always records the canonical locked ruleset; caller-provided
 * override objects are intentionally ignored.
 */
function createEngineSnapshot(results = {}, _resolvedOptions = null, context = {}) {
  const scoreWeights = { ...TF_SCORE_WEIGHTS };
  const thresholds = { ...DEFAULT_THRESHOLDS };

  const timeframes = {};
  const src = results.timeframes || {};
  for (const tf of TIMEFRAMES) {
    const t = src[tf.key];
    if (!t) continue;
    timeframes[tf.key] = {
      result: t.result ?? null,
      total: t.total ?? null,
      bias: t.bias ?? null,
      indicators: t.indicators ? { ...t.indicators } : null,
    };
  }

  const extraCheck = context.extraCheck ?? null;
  const lightsResult = results.lightsResult
    ?? (results.lightsActive ? (extraCheck && extraCheck.h1 === 1 ? 'buy' : 'sell') : 'none');

  return {
    engine_version: results.engineVersion || ENGINE_VERSION,
    engine_settings: {
      score_weights: scoreWeights,
      grade_thresholds: thresholds,
      use_m5_override: false,
      downgrade_on_now_weakness: false,
      require_alignment_for_a: false,
    },
    direction: results.mainDirection ?? null,
    raw_grade: results.rawGrade ?? null,
    effective_grade: results.effectiveGrade ?? results.grade ?? null,
    winning_score: results.winningScore ?? null,
    buy_score: results.buyScore ?? null,
    sell_score: results.sellScore ?? null,
    deep: { direction: results.deepTrend ?? null, strength: results.deepStrength ?? null },
    dd: { direction: results.ddBias ?? null, strength: results.ddStrength ?? null },
    now: { direction: results.nowBias ?? null, strength: results.nowStrength ?? null },
    alignment: calcAlignment(results).label,
    timeframes,
    extra_check: extraCheck ? { h1: extraCheck.h1 ?? null, m15: extraCheck.m15 ?? null } : null,
    lights_result: lightsResult,
    analysis_timestamp: context.timestamp ?? null,
  };
}

// Legacy compat — kept as aliases so older imports keep working.
const GRADE_THRESHOLDS = DEFAULT_THRESHOLDS;
const TF_GRADE_WEIGHTS = TF_SCORE_WEIGHTS;

export {
  TIMEFRAMES, WEIGHTS, TF_SCORE_WEIGHTS, TF_GRADE_WEIGHTS, GRADE_THRESHOLDS,
  ASSETS, BASE_ATR, TARGET_WEIGHTS,
  getDefaultInputs, calculateBias, getATRForAsset, calculateMinSafeMove,
  atrUnitForInstrument, formatAtrValue, formatWithUnit,
  engineOptionsFromSettings, createEngineSnapshot,
};