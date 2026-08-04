// PrimeBias Engine — ported cell-by-cell from the Excel workbook
// (tabs: "Bias Tool", B1–B4). Every rule below is transcribed from a specific
// Excel formula so the app reproduces the spreadsheet exactly.
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
//   A winning score above 90 flags the market EXTENDED. This is a DESCRIPTIVE
//   market state (Status), NOT a trade verdict — it does not by itself mean
//   "No Trade". The target can still be GOOD because target quality is derived
//   from the winning grade, separately from Deep/DD/Now block alignment.
//
// ── FINAL TRADE PERMISSION (Excel Extra Check) ───────────────────────────────
//   The one gate that decides Trade vs No Trade is the manual Extra Check on the
//   1H and 15M timeframes:
//     =IF(AND(1H=-1,15M=-1),"SELL",IF(AND(1H=1,15M=1),"BUY","No Trade"))
//   Until BOTH the 1H and 15M checks are entered the permission is PENDING
//   (awaiting the check) — never "No Trade". Once both are set: both -1 → SELL,
//   both +1 → BUY, any mismatch or neutral → No Trade. Status "Extended" and
//   grade "F" must never be mapped to NO_TRADE; they describe the market, not
//   the trade permission.
//
// Verified: the all-BUY snapshot saved in every workbook tab (Bias Tool, B1–B4)
// reproduces DEEP BULL/STRONG, DD BUY/STRONG, NOW BUY/STRONG, score 95, grade F.

import { calcAlignment } from './alignmentUtils';

// Stable identifier of the engine implementation. Bump this whenever the engine
// maths — weights, thresholds, grade caps or block rules — changes, so every
// completed trade keeps an honest record of which ruleset produced it. This is
// deliberately NOT a build timestamp. It is named "current" (not
// "excel-verified") because the engine may still need correcting against the
// Prime Bias workbook; only rename it once the formulas have been corrected and
// independently verified.
export const ENGINE_VERSION = 'prime-bias-current-v1';

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
// Thresholds can be overridden via user settings (Settings → Grade Thresholds).
const DEFAULT_THRESHOLDS = { extended: 92, risky: 80, A: 75, B: 55, C: 45, D: 40 };

function calcGrade(score, thresholds = DEFAULT_THRESHOLDS) {
  const t = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
  if (score >= t.extended) return 'F';
  if (score >= t.risky)    return 'C';
  if (score >= t.A)        return 'A';
  if (score >= t.B)        return 'B';
  if (score >= t.C)        return 'C';
  if (score >= t.D)        return 'D';
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
    case 'F': return 'GOOD';   // top score band — strong, reliable target
    case 'A': return 'GOOD';
    case 'B': return 'MED';
    case 'C': return 'SCALP';
    case 'D': return 'SMALL';
    default:  return 'SMALL';
  }
}

// ─── Final trade permission (Excel Extra Check) ───────────────────────────────
// =IF(AND(1H=-1,15M=-1),"SELL",IF(AND(1H=1,15M=1),"BUY","No Trade"))
// The SOLE gate for Trade vs No Trade. It reads the manual 1H/15M Extra Check
// inputs, NOT the computed timeframe directions, and is completely independent of
// status/grade. Returns:
//   'PENDING'  — 1H or 15M not yet set (awaiting the check; NOT a No-Trade)
//   'SELL'     — both -1
//   'BUY'      — both +1
//   'NO_TRADE' — both set but mismatched or neutral
function calcTradePermission(extraCheck) {
  const h1  = extraCheck ? extraCheck.h1  : null;
  const m15 = extraCheck ? extraCheck.m15 : null;
  if (h1 == null || m15 == null) return 'PENDING';
  if (h1 === -1 && m15 === -1)   return 'SELL';
  if (h1 === 1  && m15 === 1)    return 'BUY';
  return 'NO_TRADE';
}

// ─── Main calculation ─────────────────────────────────────────────────────────
function calculateBias(inputs, extraCheck = null, options = {}) {
  // Optional overrides (from user settings). Defaults preserve the Excel engine.
  const scoreWeights = options.scoreWeights || TF_SCORE_WEIGHTS;
  const thresholds   = options.thresholds   || DEFAULT_THRESHOLDS;
  const useM5Override          = !!options.useM5Override;
  const downgradeOnNowWeakness = !!options.downgradeOnNowWeakness;
  const requireAlignmentForA   = !!options.requireAlignmentForA;

  // 1. TF directions
  const tfResults = {};
  TIMEFRAMES.forEach(tf => {
    const ind = inputs[tf.key] || { close: 0, macd: 0, rsi: 0, boli: 0 };
    const total = calcTFTotal(tf.key, ind);
    const result = total <= -DIRECTION_THRESHOLD ? -1 : total >= DIRECTION_THRESHOLD ? 1 : 0;
    tfResults[tf.key] = {
      result,
      total, // Excel AD (dominant-side value)
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
  // Advanced (opt-in): let M5 dictate the NOW direction when it has a signal.
  const nowDir      = (useM5Override && r('m5') !== 0)
    ? r('m5')
    : calcBlockDir(r('h1'), r('m15'), r('m5'));
  const nowBias     = nowDir === 1 ? 'BUY' : nowDir === -1 ? 'SELL' : 'NEUTRAL';
  const nowStrength = calcAnchoredStrength(r('h1'), r('m15'), r('m5'));

  // 5. Grade score — individual TF weights (overridable via settings)
  let buyScore = 0, sellScore = 0;
  TIMEFRAMES.forEach(tf => {
    const res = r(tf.key);
    const w   = scoreWeights[tf.key] ?? TF_SCORE_WEIGHTS[tf.key];
    if (res === 1)  buyScore  += w;
    if (res === -1) sellScore += w;
  });

  // Extra Check lights (+5 if green: h1 and m15 both same non-zero direction)
  let lightsActive = false;
  if (extraCheck && extraCheck.h1 != null && extraCheck.m15 != null &&
      extraCheck.h1 !== 0 && extraCheck.h1 === extraCheck.m15) {
    lightsActive = true;
    if (extraCheck.h1 === 1) buyScore  += LIGHTS_WEIGHT;
    else                      sellScore += LIGHTS_WEIGHT;
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
  const rawGrade = calcGrade(winningScore, thresholds);

  // 8. Grade cap (Excel Q10 = IF(P9 = Q11, AC35, "C")).
  // P9 is the block-weighted trend (DEEP 10 / DD 49 / NOW 41).
  const blockBuy  = (deepDir === 1 ? BLOCK_TREND_WEIGHTS.deep : 0)
                  + (ddDir   === 1 ? BLOCK_TREND_WEIGHTS.dd   : 0)
                  + (nowDir  === 1 ? BLOCK_TREND_WEIGHTS.now  : 0);
  const blockSell = (deepDir === -1 ? BLOCK_TREND_WEIGHTS.deep : 0)
                  + (ddDir   === -1 ? BLOCK_TREND_WEIGHTS.dd   : 0)
                  + (nowDir  === -1 ? BLOCK_TREND_WEIGHTS.now  : 0);
  const blockTrend = blockBuy > blockSell ? 'BUY' : blockSell > blockBuy ? 'SELL' : 'NEUTRAL';
  const trendMatchesScore = blockTrend === scoreDirection;
  let effectiveGrade = trendMatchesScore ? rawGrade : 'C';

  // Deep-vs-score alignment (used by warnings + status heuristics).
  const deepMatchesScore =
    deepDir === 0 ||
    (deepDir === 1  && scoreDirection === 'BUY') ||
    (deepDir === -1 && scoreDirection === 'SELL');

  // Block alignment vs. the score direction (needed for advanced logic + status)
  const nowMatchesScore = nowDir === dir;
  const ddMatchesScore  = ddDir  === dir;

  // 8b. Advanced (opt-in) grade adjustments — default OFF preserves the base engine.
  const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F'];
  const capGrade = (g, floor) =>
    GRADE_ORDER.indexOf(g) < GRADE_ORDER.indexOf(floor) ? floor : g;
  // Cap to C when the NOW block is WEAK.
  if (downgradeOnNowWeakness && nowStrength === 'WEAK' && (effectiveGrade === 'A' || effectiveGrade === 'B')) {
    effectiveGrade = 'C';
  }
  // Require all three blocks aligned for an A — otherwise drop to B.
  if (requireAlignmentForA && effectiveGrade === 'A' &&
      !(deepMatchesScore && ddMatchesScore && nowMatchesScore)) {
    effectiveGrade = capGrade(effectiveGrade, 'B');
  }

  const isExtended = winningScore > EXTENDED_SCORE;

  // 9. Status — a DESCRIPTIVE read of the market/readiness state. It must never
  // encode trade permission: "Extended" and grade "F" are market states, not a
  // "No Trade" verdict. Permission is decided solely by the Extra Check (below).
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
    // C
    if (!deepMatchesScore)    status = 'Wait';
    else if (!ddMatchesScore) status = 'Trend Off';
    else                      status = 'Scalp';
  }

  // Target quality — derived from the winning grade only, INDEPENDENT of block
  // alignment and of the trade gate. An Extended/F setup keeps a GOOD target.
  const targetNote = `${targetQuality(effectiveGrade)} ${mainDirection}`;

  // Final trade permission — the Excel Extra Check gate, kept strictly separate
  // from status/grade. PENDING until both 1H and 15M are set; then BUY/SELL/
  // NO_TRADE per the Extra Check. Extended/F never force NO_TRADE here.
  const tradeAction = calcTradePermission(extraCheck);

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
  if (isExtended)
    warnings.push('Score >90 — market EXTENDED, high reversal risk');
  else if (winningScore >= 80)
    warnings.push('Score 80-90 — approaching extended territory, use caution');

  const plusMinusScore  = r('h1') + r('m15') + r('m5');
  const alignedCount    = TIMEFRAMES.filter(tf => r(tf.key) === dir).length;
  const confidenceScore = Math.round((alignedCount / TIMEFRAMES.length) * 100);
  const gradeLabel      = calcGradeLabel(effectiveGrade, winningScore);

  // Resolved options ACTUALLY applied to this analysis, captured as concrete
  // values (never references to the user's mutable settings) so a completed trade
  // can freeze exactly what produced it. This mirrors, per-key, the same
  // fallbacks the scoring/grading above used — it does not change any maths.
  const resolvedScoreWeights = {};
  TIMEFRAMES.forEach(tf => {
    resolvedScoreWeights[tf.key] = scoreWeights[tf.key] ?? TF_SCORE_WEIGHTS[tf.key];
  });
  const resolvedThresholds = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
  const resolvedOptions = {
    scoreWeights: resolvedScoreWeights,
    thresholds: resolvedThresholds,
    useM5Override,
    downgradeOnNowWeakness,
    requireAlignmentForA,
  };

  // Extra-check (red-light/green-light) outcome as a concrete result.
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

function calculateTarget(atr, grade) {
  if (!atr) return null;
  const target = (atr * (TARGET_WEIGHTS[grade] || 0.5)) / TARGET_DIVISOR;
  return { target: parseFloat(target.toFixed(4)), targetType: grade };
}

// Build engine options from a user-settings object (see lib/userSettings.js).
// Missing/invalid values fall back to the Excel defaults.
function engineOptionsFromSettings(settings) {
  if (!settings) return {};
  return {
    scoreWeights: settings.weights || undefined,
    thresholds:   settings.gradeThresholds || undefined,
    useM5Override:          !!settings.useM5Override,
    downgradeOnNowWeakness: !!settings.downgradeOnNowWeakness,
    requireAlignmentForA:   !!settings.requireAlignmentForA,
  };
}

/**
 * Build the immutable engine snapshot persisted with a completed trade.
 *
 * Pure and JSON-serialisable: it copies RESOLVED values out of a calculateBias()
 * result (and the resolved options that produced it) so the trade can be
 * reproduced later no matter how the user's live settings change afterwards. It
 * NEVER reads global settings and NEVER recomputes the grade — it only records
 * what the engine already decided.
 *
 * @param {any} results  a calculateBias() result object.
 * @param {any} [resolvedOptions]  the resolved options used; defaults to
 *   `results.resolvedOptions`, then to engine defaults when neither is present.
 * @param {{ extraCheck?: any, timestamp?: string|null }} [context]  extra-check
 *   inputs and the analysis timestamp, which live on the analysis rather than the
 *   engine result.
 * @returns {object} a plain, serialisable snapshot of resolved values.
 */
function createEngineSnapshot(results = {}, resolvedOptions = null, context = {}) {
  const opts = resolvedOptions || results.resolvedOptions || {};
  const scoreWeights = { ...(opts.scoreWeights || TF_SCORE_WEIGHTS) };
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(opts.thresholds || {}) };

  // Per-timeframe calculated results + the raw indicator inputs already on them,
  // so a breakdown never has to be recomputed under later settings.
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
      use_m5_override: !!opts.useM5Override,
      downgrade_on_now_weakness: !!opts.downgradeOnNowWeakness,
      require_alignment_for_a: !!opts.requireAlignmentForA,
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
  getDefaultInputs, calculateBias, getATRForAsset, calculateTarget,
  engineOptionsFromSettings, createEngineSnapshot,
};
