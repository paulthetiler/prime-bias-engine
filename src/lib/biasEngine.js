// PrimeBias Engine - faithful recreation of the Excel Bias Tool logic

// Indicator weights per timeframe (Close, MACD, RSI, Boli)
const WEIGHTS = {
  month: { close: 40, macd: 30, rsi: 10, boli: 20 },
  week:  { close: 30, macd: 40, rsi: 10, boli: 20 },
  day:   { close: 35, macd: 40, rsi: 10, boli: 15 },
  h4:    { close: 25, macd: 20, rsi: 20, boli: 35 },
  h1:    { close: 0,  macd: 20, rsi: 40, boli: 40 },
  m15:   { close: 0,  macd: 20, rsi: 40, boli: 40 },
  m5:    { close: 0,  macd: 10, rsi: 50, boli: 40 },
};

// Timeframe display config
const TIMEFRAMES = [
  { key: 'month', label: 'Monthly',  shortLabel: 'M',   row: 1, group: 'broadstroke' },
  { key: 'week',  label: 'Weekly',   shortLabel: 'W',   row: 2, group: 'broadstroke' },
  { key: 'day',   label: 'Daily',    shortLabel: 'D',   row: 3, group: 'broadstroke' },
  { key: 'h4',    label: '4 Hour',   shortLabel: '4H',  row: 4, group: 'trigger' },
  { key: 'h1',    label: '1 Hour',   shortLabel: '1H',  row: 5, group: 'trigger' },
  { key: 'm15',   label: '15 Min',   shortLabel: '15m', row: 6, group: 'trigger' },
  { key: 'm5',    label: '5 Min',    shortLabel: '5m',  row: 7, group: 'trigger' },
];

// Default empty inputs
function getDefaultInputs() {
  const inputs = {};
  TIMEFRAMES.forEach(tf => {
    inputs[tf.key] = { close: 0, macd: 0, rsi: 0, boli: 0 };
  });
  return inputs;
}

// Calculate weighted score for a single timeframe
// Returns a signed integer total and a result: +1=BUY, -1=SELL, 0=neutral
function calcTimeframeScore(tfKey, indicators) {
  const w = WEIGHTS[tfKey];
  const total =
    (indicators.close * w.close) +
    (indicators.macd  * w.macd)  +
    (indicators.rsi   * w.rsi)   +
    (indicators.boli  * w.boli);

  let result = 0;
  if (total > 0) result = 1;
  else if (total < 0) result = -1;

  const bias = result === 1 ? 'BUY' : result === -1 ? 'SELL' : '';
  return { total, result, bias, indicators };
}

// ─── Main bias calculation ────────────────────────────────────────────────────
function calculateBias(inputs) {
  const tfResults = {};
  TIMEFRAMES.forEach(tf => {
    const ind = inputs[tf.key] || { close: 0, macd: 0, rsi: 0, boli: 0 };
    tfResults[tf.key] = calcTimeframeScore(tf.key, ind);
  });

  // ── 1. DEEP TREND  (M only, as per Excel)
  const deepResult = tfResults.month.result;
  const deepTrend  = deepResult === 1 ? 'BULL' : deepResult === -1 ? 'BEAR' : 'NEUTRAL';

  // Strength for Deep: sum of weighted totals for M + W + D
  const bsWeightedSum =
    tfResults.month.total + tfResults.week.total + tfResults.day.total;
  const deepStrength = Math.abs(bsWeightedSum) >= 100 ? 'STRONG' : 'WEAK';

  // ── 2. DD (Dominant Direction) — Daily result only (the "close-in" trend from M/W/D)
  // Excel DD = the Daily (D) row result, as it is the most recent broadstroke timeframe
  const ddResult = tfResults.day.result;
  const ddBias   = ddResult === 1 ? 'BUY' : ddResult === -1 ? 'SELL' : 'NEUTRAL';

  // DD strength based on Daily weighted total
  const ddAbsSum = Math.abs(tfResults.day.total);
  const ddStrength = ddAbsSum >= 80 ? 'STRONG' : ddAbsSum >= 30 ? 'MEDIUM' : 'WEAK';

  // ── 3. NOW (4H + 1H + 15m + 5m) — weighted sum
  const nowWeightedSum =
    tfResults.h4.total + tfResults.h1.total + tfResults.m15.total + tfResults.m5.total;
  const nowResult = nowWeightedSum > 0 ? 1 : nowWeightedSum < 0 ? -1 : 0;
  const nowBias   = nowResult === 1 ? 'BUY' : nowResult === -1 ? 'SELL' : 'NEUTRAL';

  const nowAbsSum = Math.abs(nowWeightedSum);
  const nowStrength = nowAbsSum >= 150 ? 'STRONG' : nowAbsSum >= 50 ? 'MEDIUM' : 'WEAK';

  // ── 4. OVERALL TREND direction — majority vote across all 7 TF results
  //    (same as Excel TREND cell: count BUY vs SELL results)
  const buyCount  = TIMEFRAMES.filter(tf => tfResults[tf.key].result === 1).length;
  const sellCount = TIMEFRAMES.filter(tf => tfResults[tf.key].result === -1).length;
  // Tie-break: use weighted totals
  const allWeightedSum = TIMEFRAMES.reduce((s, tf) => s + tfResults[tf.key].total, 0);
  const mainDirection = allWeightedSum >= 0 ? 'BUY' : 'SELL';

  // ── 5. EXTRA CHECK  (Excel "Extra Check" logic)
  //    1H result and 15M result must BOTH be non-zero AND agree.
  //    If either is 0 OR they disagree → No Trade.
  const h1res  = tfResults.h1.result;
  const m15res = tfResults.m15.result;
  const extraCheckPass = (h1res !== 0) && (m15res !== 0) && (h1res === m15res);
  const extraCheckNote = extraCheckPass
    ? (h1res === 1 ? 'BUY signal confirmed' : 'SELL signal confirmed')
    : `No Trade — 1H = ${h1res > 0 ? '+1' : h1res < 0 ? '-1' : '0'}, 15M = ${m15res > 0 ? '+1' : m15res < 0 ? '-1' : '0'}`;

  // ── 6. GRADE  (based on alignment of DD + NOW + Extra Check)
  //    A — DD & NOW agree, extra check passes, 4H aligns
  //    B — DD & NOW agree, extra check passes
  //    C — DD & NOW agree but extra check fails (Scalp only)
  //    D — DD & NOW disagree but same as mainDirection
  //    F — complete conflict / no clear signal
  let grade = 'F';
  let gradeLabel = 'No Trade';

  const ddNowAgree = (ddResult !== 0) && (nowResult !== 0) && (ddResult === nowResult);
  const h4aligns   = tfResults.h4.result === (mainDirection === 'BUY' ? 1 : -1);

  if (ddNowAgree && extraCheckPass && h4aligns) {
    grade = 'A'; gradeLabel = 'Very Good';
  } else if (ddNowAgree && extraCheckPass) {
    grade = 'B'; gradeLabel = 'Good';
  } else if (ddNowAgree && !extraCheckPass) {
    grade = 'C'; gradeLabel = 'Scalp';
  } else if (!ddNowAgree && ddResult === (mainDirection === 'BUY' ? 1 : -1)) {
    grade = 'D'; gradeLabel = 'Dangerous';
  } else {
    grade = 'F'; gradeLabel = 'No Trade';
  }

  // ── 7. TARGET label (Excel "Target" cell)
  let targetNote = '';
  const dirLabel = mainDirection === 'BUY' ? 'BUY' : 'SELL';
  if (grade === 'A') targetNote = `STRONG ${dirLabel}`;
  else if (grade === 'B') targetNote = `MED ${dirLabel}`;
  else if (grade === 'C') targetNote = `SCALP ${dirLabel}`;
  else if (grade === 'D') targetNote = `WAIT`;
  else targetNote = `NO TRADE`;

  // ── 8. TRADE ACTION
  let tradeAction = 'NO_TRADE';
  let status = 'No Trade';

  if (grade === 'A' || grade === 'B') {
    tradeAction = 'TRADE';
    status = 'Ready';
  } else if (grade === 'C') {
    tradeAction = 'TRADE';
    status = 'Scalp';
  } else if (grade === 'D') {
    tradeAction = 'WAIT';
    status = 'Dangerous';
  }

  // ── 9. WARNINGS
  const warnings = [];
  if (!extraCheckPass) {
    warnings.push(`Extra Check: ${extraCheckNote}`);
  }
  if (ddNowAgree && ddResult !== deepResult && deepResult !== 0) {
    warnings.push('DD/NOW conflict with Deep Trend — counter-trend setup');
  }
  if (ddResult !== 0 && nowResult !== 0 && ddResult !== nowResult) {
    warnings.push('MIXED — DD and NOW disagree, caution advised');
  }

  // ── 10. Confidence score (display only)
  const alignedCount = TIMEFRAMES.filter(tf =>
    tfResults[tf.key].result === (mainDirection === 'BUY' ? 1 : -1)
  ).length;
  const confidenceScore = Math.round((alignedCount / TIMEFRAMES.length) * 100);

  return {
    timeframes: tfResults,
    deepTrend,
    deepResult,
    deepStrength,
    ddBias,
    ddResult,
    ddStrength,
    nowBias,
    nowResult,
    nowStrength,
    mainDirection,
    confidenceScore,
    grade,
    gradeLabel,
    strength: ddStrength, // used by BiasResult "signal" label
    warnings,
    tradeAction,
    status,
    targetNote,
    extraCheckPass,
    extraCheckNote,
  };
}

// ─── Asset list ───────────────────────────────────────────────────────────────
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

// Base ATR values for each asset
const BASE_ATR = {
  'AUD/CAD': 0.0055, 'AUD/CHF': 0.0062, 'AUD/JPY': 0.78, 'AUD/NZD': 0.0082, 'AUD/USD': 0.0078,
  'CAD/CHF': 0.0070, 'CAD/JPY': 0.86, 'CHF/JPY': 1.25, 'EUR/AUD': 0.0155, 'EUR/CAD': 0.0155,
  'EUR/CHF': 0.0095, 'EUR/GBP': 0.0095, 'EUR/JPY': 1.35, 'EUR/NZD': 0.0188, 'EUR/USD': 0.0120,
  'GBP/AUD': 0.0210, 'GBP/CAD': 0.0190, 'GBP/CHF': 0.0130, 'GBP/JPY': 1.65, 'GBP/NZD': 0.0250, 'GBP/USD': 0.0145,
  'NZD/CAD': 0.0068, 'NZD/CHF': 0.0075, 'NZD/JPY': 0.95, 'NZD/USD': 0.0095,
  'USD/CAD': 0.0095, 'USD/CHF': 0.0110, 'USD/JPY': 1.50,
  'DAX': 200, 'FTSE': 150, 'DOW': 250, 'SP500': 80, 'US100': 200, 'CAC40': 120, 'JAP225': 800,
  'GOLD': 25, 'GOLD/USD': 25, 'OIL': 2.5, 'GAS': 0.35, 'BITCOIN': 3500, 'ETHUSDT': 250,
  'Copper': 0.025, 'Aluminum': 35, 'Zinc': 85, 'Lead': 45, 'Carbon': 0.95,
  'Dollar': 1.5, 'Hong HS50': 800, 'AUD200': 350, 'SMI': 250,
};

// Target weight multipliers
const TARGET_WEIGHTS = {
  A: 1.25,
  B: 1,
  C: 0.75,
  D: 0.5,
};

// Get ATR for an asset, considering top 5 overrides
function getATRForAsset(asset, topAssets) {
  for (let i = 0; i < topAssets.length; i++) {
    if (topAssets[i].asset === asset && topAssets[i].atr) {
      return topAssets[i].atr;
    }
  }
  return BASE_ATR[asset] || 0;
}

// Calculate target price from ATR
function calculateTarget(atr, grade, status) {
  if (!atr || atr === 0) return null;
  const baseUnit = atr;
  const multiplier = TARGET_WEIGHTS[grade] || 0.5;
  const target = baseUnit * multiplier;
  return { target: parseFloat(target.toFixed(6)), targetType: grade };
}

// Unused but kept for legacy export compatibility
const GRADE_THRESHOLDS = [];
const TF_GRADE_WEIGHTS = {};

export {
  TIMEFRAMES, WEIGHTS, TF_GRADE_WEIGHTS, GRADE_THRESHOLDS,
  ASSETS, BASE_ATR, TARGET_WEIGHTS,
  getDefaultInputs, calculateBias, getATRForAsset, calculateTarget,
};