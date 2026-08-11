// Prime Bias canonical engine.
//
// Source of truth: the uploaded "Prime Bias.xlsx" workbook, sheet "Bias Tool".
// The workbook is canonical. This file intentionally mirrors its formulas;
// app UX may present the outputs differently, but must not reinterpret the maths.
//
// Canonical cells:
//   J4:J10 / AD:AE  timeframe directions
//   O4/P4/Q4         DEEP
//   O6/P6/Q6         DD
//   O8/P8/Q8         NOW
//   AC24:AD33        BUY/SELL score tallies (+5 Extra Check lights)
//   AC34             Trade direction
//   AB35 / AC35      winning score / raw grade
//   P9 / Q10         block trend / capped grade
//   P10              Status
//   M10              Readiness
//   O11 / Q11        Target quality / trade direction
//   K12              manual Extra Check
//   P12 / Q12        MACD Extra direction / quality

import { calcAlignment } from './alignmentUtils';
import { CURRENT_ENGINE_VERSION } from './engineConfig';

export const ENGINE_VERSION = CURRENT_ENGINE_VERSION;

const TIMEFRAMES = [
  { key: 'month', label: 'Monthly', shortLabel: 'M', group: 'broadstroke' },
  { key: 'week', label: 'Weekly', shortLabel: 'W', group: 'broadstroke' },
  { key: 'day', label: 'Daily', shortLabel: 'D', group: 'broadstroke' },
  { key: 'h4', label: '4 Hour', shortLabel: '4H', group: 'trigger' },
  { key: 'h1', label: '1 Hour', shortLabel: '1H', group: 'trigger' },
  { key: 'm15', label: '15 Min', shortLabel: '15m', group: 'trigger' },
  { key: 'm5', label: '5 Min', shortLabel: '5m', group: 'trigger' },
];

const WEIGHTS = {
  month: { close: 40, macd: 30, rsi: 10, boli: 20 },
  week: { close: 30, macd: 40, rsi: 10, boli: 20 },
  day: { close: 35, macd: 25, rsi: 10, boli: 30 },
  h4: { close: 25, macd: 20, rsi: 20, boli: 35 },
  h1: { close: 0, macd: 20, rsi: 40, boli: 40 },
  m15: { close: 0, macd: 15, rsi: 40, boli: 45 },
  m5: { close: 0, macd: 5, rsi: 50, boli: 45 },
};

const DIRECTION_THRESHOLD = 35;
const TF_SCORE_WEIGHTS = { month: 2, week: 5, day: 10, h4: 30, h1: 33, m15: 10, m5: 5 };
const LIGHTS_WEIGHT = 5;
const BLOCK_TREND_WEIGHTS = { deep: 10, dd: 49, now: 41 };
const EXTENDED_SCORE = 90;
const DEFAULT_THRESHOLDS = { extended: 92, risky: 80, A: 75, B: 55, C: 45, D: 40 };

const ASSETS = [
  'AUD/CAD','AUD/CHF','AUD/JPY','AUD/NZD','AUD/USD','CAD/CHF','CAD/JPY','CHF/JPY','EUR/AUD','EUR/CAD',
  'EUR/CHF','EUR/GBP','EUR/JPY','EUR/NZD','EUR/USD','GBP/AUD','GBP/CAD','GBP/CHF','GBP/JPY','GBP/NZD','GBP/USD',
  'NZD/CAD','NZD/CHF','NZD/JPY','NZD/USD','USD/CAD','USD/CHF','USD/JPY','DAX','FTSE','DOW','SP500','US100','CAC40',
  'JAP225','GOLD','GOLD/USD','OIL','GAS','BITCOIN','ETHUSDT','Copper','Aluminum','Zinc','Lead','Carbon','Dollar','Hong HS50','AUD200','SMI',
];

const BASE_ATR = {
  'AUD/CAD':110,'AUD/CHF':38,'AUD/JPY':62,'AUD/NZD':43,'AUD/USD':50,'CAD/CHF':40,'CAD/JPY':78,'CHF/JPY':108,
  'EUR/AUD':91,'EUR/CAD':68,'EUR/CHF':40,'EUR/GBP':29,'EUR/JPY':155,'EUR/NZD':102,'EUR/USD':55,'GBP/AUD':107,
  'GBP/CAD':86,'GBP/CHF':56,'GBP/JPY':128,'GBP/NZD':126,'GBP/USD':90,'NZD/CAD':49,'NZD/CHF':36,'NZD/JPY':60,
  'NZD/USD':48,'USD/CAD':58,'USD/CHF':55,'USD/JPY':112,'DAX':161,'FTSE':60,'DOW':260,'SP500':35,'US100':178,
  'CAC40':74,'JAP225':476,'GOLD':19,'GOLD/USD':200,'OIL':111,'GAS':140,'BITCOIN':1565,'ETHUSDT':95,'Copper':108,
  'Aluminum':40,'Zinc':50,'Lead':36,'Carbon':274,'Dollar':50,'Hong HS50':380,'AUD200':61,'SMI':95,
};

const TARGET_WEIGHTS = { A: 1.25, B: 1.0, C: 0.75, D: 0.5 };
const TARGET_DIVISOR = 9;

function getDefaultInputs() {
  const inputs = {};
  TIMEFRAMES.forEach(tf => { inputs[tf.key] = { close: 0, macd: 0, rsi: 0, boli: 0 }; });
  return inputs;
}

function calcTFTotal(tfKey, ind) {
  const w = WEIGHTS[tfKey];
  const contribs = [(ind.close ?? 0) * w.close, (ind.macd ?? 0) * w.macd, (ind.rsi ?? 0) * w.rsi, (ind.boli ?? 0) * w.boli];
  const pos = contribs.reduce((s, v) => (v > 0 ? s + v : s), 0);
  const neg = contribs.reduce((s, v) => (v < 0 ? s + v : s), 0);
  return Math.abs(neg) > Math.abs(pos) ? neg : pos;
}

function calcTFResult(tfKey, ind) {
  const total = calcTFTotal(tfKey, ind);
  if (total <= -DIRECTION_THRESHOLD) return -1;
  if (total >= DIRECTION_THRESHOLD) return 1;
  return 0;
}

// Excel O4/O6/O8 = IFERROR(MODE(...),""). All-three-different is blank, not Neutral.
function calcBlockDir(r0, r1, r2) {
  const arr = [r0, r1, r2];
  for (const v of [1, -1, 0]) if (arr.filter(x => x === v).length >= 2) return v;
  return null;
}

function calcAnchoredStrength(anchor, other1, other2, blockDir) {
  if (blockDir == null) return '';
  if (anchor === 1) {
    if (other1 === 1 && other2 === 1) return 'STRONG';
    if (other1 === 1 || other2 === 1) return 'MEDIUM';
    return 'WEAK';
  }
  if (anchor === -1) {
    if (other1 === -1 && other2 === -1) return 'STRONG';
    if (other1 === -1 || other2 === -1) return 'MEDIUM';
    return 'WEAK';
  }
  return 'WEAK';
}

function calcGrade(score) {
  if (score > 91) return 'F';
  if (score >= 80) return 'C';
  if (score >= 75) return 'A';
  if (score >= 55) return 'B';
  if (score >= 45) return 'C';
  return 'D';
}

function calcGradeLabel(grade) {
  if (grade === 'A') return 'Good';
  if (grade === 'B') return 'Fair';
  if (grade === 'C') return 'Risky';
  if (grade === 'D') return 'Dangerous';
  if (grade === 'F') return 'Fail';
  return '';
}

function dirLabel(dir, deep = false) {
  if (dir === 1) return deep ? 'BULL' : 'BUY';
  if (dir === -1) return deep ? 'BEAR' : 'SELL';
  if (dir === 0) return 'Neutral';
  return '';
}

function directionNumber(direction) {
  if (direction === 'BUY') return 1;
  if (direction === 'SELL') return -1;
  return null;
}

// Excel K12. Blank/unset manual checks still calculate as No Trade.
function calcExtraCheckResult(extraCheck) {
  const h1 = extraCheck?.h1 ?? null;
  const m15 = extraCheck?.m15 ?? null;
  if (h1 === -1 && m15 === -1) return 'SELL';
  if (h1 === 1 && m15 === 1) return 'BUY';
  return 'NO_TRADE';
}

function calcExtraCheckConfirmation(extraCheckResult, tradeDirection, extraCheck) {
  if (extraCheck?.h1 == null || extraCheck?.m15 == null) return 'NOT_CHECKED';
  return extraCheckResult === tradeDirection ? 'CONFIRMS' : 'CONFLICTS';
}

// Excel O11.
function calcTargetQuality(deepTrend, ddBias, nowBias, h1Bias) {
  if (!h1Bias) return '';
  if (deepTrend === 'BULL' && ddBias === 'BUY' && nowBias === 'BUY') return 'GOOD';
  if (ddBias === 'BUY' && nowBias === 'BUY') return 'MED';
  if (deepTrend === 'BEAR' && ddBias === 'SELL' && nowBias === 'SELL') return 'GOOD';
  if (ddBias === 'SELL' && nowBias === 'SELL') return 'MED';
  return 'Min';
}

// Excel P10.
function calcStatus({ winningScore, rawGrade, ddBias, nowBias, h1Result, m15Result, m5Result, m5Rsi, nowDir, tradeDirection }) {
  if (m5Rsi == null) return '';
  if (winningScore > EXTENDED_SCORE) return 'Extended';
  if (rawGrade === 'F' || rawGrade === 'D') return 'NO';
  if (ddBias === nowBias && h1Result === m5Result && m5Rsi === h1Result) return 'YES';
  if (ddBias === nowBias && h1Result === m15Result && m5Rsi !== h1Result) return 'Wait';
  // Scruff parity: Scalp cannot be generated when Dominant Direction is blank
  // or opposes the trade. Winston's GBP/JPY case proves the old non-blank-only
  // guard was too weak.
  if (ddBias === tradeDirection && nowDir === directionNumber(tradeDirection) && m5Rsi === h1Result) return 'Scalp';
  return 'No';
}

// Excel M10.
function calcReadiness({ m5Rsi, blockTrend, tradeDirection, status }) {
  if (m5Rsi == null) return '';
  if (blockTrend !== tradeDirection) return 'Trend Off';
  if (status === 'YES' || status === 'Scalp') return 'Ready';
  if (status === 'Wait') return 'Trend Off';
  if (status === 'No' || status === 'NO') return 'No';
  return 'Ready';
}

// Excel P12/Q12: the separate MACD Extra calculation.
function calcMacdExtra(inputs, status) {
  const g7 = inputs.h4?.macd ?? 0;
  const g8 = inputs.h1?.macd ?? 0;
  const g9 = inputs.m15?.macd ?? 0;
  const g10 = inputs.m5?.macd ?? 0;
  const m5Rsi = inputs.m5?.rsi;
  if (m5Rsi == null || status === 'Scalp') return { extraDirection: '', extraQuality: '' };

  let extraDirection = '';
  if (g8 === -1 && [g7, g8, g9, g10].filter(v => v === -1).length >= 3) extraDirection = 'SELL';
  if (g8 === 1 && [g7, g8, g9, g10].filter(v => v === 1).length >= 3) extraDirection = 'BUY';
  if (!extraDirection) return { extraDirection: '', extraQuality: '' };

  let extraQuality = 'NO';
  if (g7 === g8 && g8 === g9) extraQuality = 'GOOD';
  else if (g9 === g8 && g10 === g8) extraQuality = 'Scalp';
  else if (g7 === g8 && g10 === g8) extraQuality = 'CAREFUL';
  return { extraDirection, extraQuality };
}

function calculateBias(inputs, extraCheck = null, _options = {}) {
  const tfResults = {};
  TIMEFRAMES.forEach(tf => {
    const ind = inputs[tf.key] || { close: 0, macd: 0, rsi: 0, boli: 0 };
    const total = calcTFTotal(tf.key, ind);
    const result = calcTFResult(tf.key, ind);
    tfResults[tf.key] = {
      result, total,
      indicators: { close: ind.close ?? 0, macd: ind.macd ?? 0, rsi: ind.rsi ?? 0, boli: ind.boli ?? 0 },
      bias: result === 1 ? 'BUY' : result === -1 ? 'SELL' : 'Neutral',
    };
  });
  const r = key => tfResults[key].result;

  const deepDir = calcBlockDir(r('month'), r('week'), r('day'));
  const deepTrend = dirLabel(deepDir, true);
  const deepStrength = calcAnchoredStrength(r('day'), r('month'), r('week'), deepDir);
  const ddDir = calcBlockDir(r('day'), r('h4'), r('h1'));
  const ddBias = dirLabel(ddDir);
  const ddStrength = calcAnchoredStrength(r('h1'), r('day'), r('h4'), ddDir);
  const nowDir = calcBlockDir(r('h1'), r('m15'), r('m5'));
  const nowBias = dirLabel(nowDir);
  const nowStrength = calcAnchoredStrength(r('h1'), r('m15'), r('m5'), nowDir);

  let buyScore = 0, sellScore = 0;
  TIMEFRAMES.forEach(tf => {
    if (r(tf.key) === 1) buyScore += TF_SCORE_WEIGHTS[tf.key];
    if (r(tf.key) === -1) sellScore += TF_SCORE_WEIGHTS[tf.key];
  });

  const extraCheckResult = calcExtraCheckResult(extraCheck);
  let lightsActive = false;
  if (extraCheckResult === 'BUY') { buyScore += LIGHTS_WEIGHT; lightsActive = true; }
  else if (extraCheckResult === 'SELL') { sellScore += LIGHTS_WEIGHT; lightsActive = true; }

  // Excel AC34: score winner, then 1H score row as tie-break, otherwise NILL.
  let scoreDirection = 'NILL';
  if (buyScore > sellScore) scoreDirection = 'BUY';
  else if (sellScore > buyScore) scoreDirection = 'SELL';
  else if (r('h1') === 1) scoreDirection = 'BUY';
  else if (r('h1') === -1) scoreDirection = 'SELL';

  const winningScore = scoreDirection === 'BUY' ? buyScore : scoreDirection === 'SELL' ? sellScore : 0;
  const rawGrade = calcGrade(winningScore);

  const blockBuy = (deepDir === 1 ? 10 : 0) + (ddDir === 1 ? 49 : 0) + (nowDir === 1 ? 41 : 0);
  const blockSell = (deepDir === -1 ? 10 : 0) + (ddDir === -1 ? 49 : 0) + (nowDir === -1 ? 41 : 0);
  const blockTrend = blockBuy > blockSell ? 'BUY' : blockSell > blockBuy ? 'SELL' : 'Neutral';
  const effectiveGrade = blockTrend === scoreDirection ? rawGrade : 'C';

  const m5Rsi = inputs.m5?.rsi;
  const status = calcStatus({ winningScore, rawGrade, ddBias, nowBias, h1Result: r('h1'), m15Result: r('m15'), m5Result: r('m5'), m5Rsi, nowDir, tradeDirection: scoreDirection });
  const readiness = calcReadiness({ m5Rsi, blockTrend, tradeDirection: scoreDirection, status });
  const targetQuality = calcTargetQuality(deepTrend, ddBias, nowBias, tfResults.h1.bias);
  const targetDirection = scoreDirection;
  const targetNote = targetQuality ? `${targetQuality} ${targetDirection}` : targetDirection;
  const { extraDirection, extraQuality } = calcMacdExtra(inputs, status);
  const extraCheckConfirmation = calcExtraCheckConfirmation(extraCheckResult, scoreDirection, extraCheck);

  const tradeAction = scoreDirection; // canonical Excel Trade = AC34
  const mainDirection = scoreDirection;

  const warnings = [];
  if (blockTrend !== scoreDirection && scoreDirection !== 'NILL') warnings.push('Block trend conflicts with score direction — grade capped at C');
  if (status === 'Extended') warnings.push('Extended conditions — valid setup, but use extra caution');
  if (status === 'Wait') warnings.push('Workbook status is Wait — monitor 15m');
  if (readiness === 'Trend Off') warnings.push('Workbook readiness is Trend Off');

  const plusMinusScore = r('h1') + r('m15') + r('m5');
  const dir = directionNumber(scoreDirection);
  const alignedCount = dir == null ? 0 : TIMEFRAMES.filter(tf => r(tf.key) === dir).length;
  const confidenceScore = Math.round((alignedCount / TIMEFRAMES.length) * 100);
  const gradeLabel = calcGradeLabel(effectiveGrade);
  const resolvedOptions = { scoreWeights: { ...TF_SCORE_WEIGHTS }, thresholds: { ...DEFAULT_THRESHOLDS }, useM5Override: false, downgradeOnNowWeakness: false, requireAlignmentForA: false };
  const lightsResult = lightsActive ? (extraCheckResult === 'BUY' ? 'buy' : 'sell') : 'none';

  return {
    timeframes: tfResults,
    deepTrend, deepResult: deepDir, deepStrength,
    ddBias, ddResult: ddDir, ddStrength,
    nowBias, nowResult: nowDir, nowStrength,
    buyScore, sellScore, winningScore, plusMinusScore, lightsActive, lightsResult,
    mainDirection, scoreDirection,
    rawGrade, effectiveGrade, grade: effectiveGrade, gradeLabel, strength: ddStrength,
    tradeAction, tradeDirection: scoreDirection,
    status, readiness,
    targetQuality, targetDirection, targetNote,
    extraDirection, extraQuality,
    extraCheckResult, extraCheckConfirmation,
    blockTrend,
    confidenceScore, warnings,
    engineVersion: ENGINE_VERSION,
    resolvedOptions,
  };
}

function getATRForAsset(asset, topAssets) {
  for (const ta of topAssets) if (ta.asset === asset && ta.atr) return parseFloat(ta.atr);
  return BASE_ATR[asset] || 0;
}

function calculateMinSafeMove(atr, grade) {
  if (!atr) return null;
  const value = parseFloat(((atr * (TARGET_WEIGHTS[grade] || 0.5)) / TARGET_DIVISOR).toFixed(4));
  return { value, grade, target: value, targetType: grade };
}

const FOREX_CURRENCIES = new Set(['AUD','CAD','CHF','CNH','DKK','EUR','GBP','HKD','JPY','MXN','NOK','NZD','PLN','SEK','SGD','TRY','USD','ZAR']);
const METAL_CURRENCIES = new Set(['XAU','XAG','XPT','XPD']);
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
  return `${formatted} ${formatted === '1' ? unit.slice(0, -1) : unit}`;
}
function engineOptionsFromSettings(_settings) { return {}; }

function createEngineSnapshot(results = {}, _resolvedOptions = null, context = {}) {
  const timeframes = {};
  const src = results.timeframes || {};
  for (const tf of TIMEFRAMES) {
    const t = src[tf.key];
    if (!t) continue;
    timeframes[tf.key] = { result: t.result ?? null, total: t.total ?? null, bias: t.bias ?? null, indicators: t.indicators ? { ...t.indicators } : null };
  }
  const extraCheck = context.extraCheck ?? null;
  const lightsResult = results.lightsResult ?? (results.lightsActive ? (extraCheck?.h1 === 1 ? 'buy' : 'sell') : 'none');
  return {
    engine_version: results.engineVersion || ENGINE_VERSION,
    engine_settings: { score_weights: { ...TF_SCORE_WEIGHTS }, grade_thresholds: { ...DEFAULT_THRESHOLDS }, use_m5_override: false, downgrade_on_now_weakness: false, require_alignment_for_a: false },
    direction: results.mainDirection ?? null,
    raw_grade: results.rawGrade ?? null,
    effective_grade: results.effectiveGrade ?? results.grade ?? null,
    winning_score: results.winningScore ?? null,
    buy_score: results.buyScore ?? null,
    sell_score: results.sellScore ?? null,
    deep: { direction: results.deepTrend ?? null, strength: results.deepStrength ?? null },
    dd: { direction: results.ddBias ?? null, strength: results.ddStrength ?? null },
    now: { direction: results.nowBias ?? null, strength: results.nowStrength ?? null },
    status: results.status ?? null,
    readiness: results.readiness ?? null,
    target_quality: results.targetQuality ?? null,
    trade_direction: results.tradeDirection ?? results.scoreDirection ?? null,
    extra_direction: results.extraDirection ?? null,
    extra_quality: results.extraQuality ?? null,
    block_trend: results.blockTrend ?? null,
    alignment: calcAlignment(results).label,
    timeframes,
    extra_check: extraCheck ? { h1: extraCheck.h1 ?? null, m15: extraCheck.m15 ?? null } : null,
    lights_result: lightsResult,
    analysis_timestamp: context.timestamp ?? null,
  };
}

const GRADE_THRESHOLDS = DEFAULT_THRESHOLDS;
const TF_GRADE_WEIGHTS = TF_SCORE_WEIGHTS;
export {
  TIMEFRAMES, WEIGHTS, TF_SCORE_WEIGHTS, TF_GRADE_WEIGHTS, GRADE_THRESHOLDS,
  ASSETS, BASE_ATR, TARGET_WEIGHTS,
  getDefaultInputs, calculateBias, getATRForAsset, calculateMinSafeMove,
  atrUnitForInstrument, formatAtrValue, formatWithUnit,
  engineOptionsFromSettings, createEngineSnapshot,
};