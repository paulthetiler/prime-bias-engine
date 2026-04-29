// PrimeBias Engine - faithful recreation of the Excel Bias Tool logic

// Timeframe weights from the Excel weight table (Close, MACD, RSI, Boli per timeframe)
// These are the scoring weights that convert +1/-1/0 inputs into weighted scores
const WEIGHTS = {
  month: { close: 40, macd: 30, rsi: 10, boli: 20 },
  week:  { close: 30, macd: 40, rsi: 10, boli: 20 },
  day:   { close: 35, macd: 40, rsi: 10, boli: 15 },
  h4:    { close: 25, macd: 20, rsi: 20, boli: 35 },
  h1:    { close: 0,  macd: 20, rsi: 40, boli: 40 },
  m15:   { close: 0,  macd: 20, rsi: 40, boli: 40 },
  m5:    { close: 0,  macd: 10, rsi: 50, boli: 40 },
};

// Timeframe display config matching Excel layout
const TIMEFRAMES = [
  { key: 'month', label: 'Monthly',  shortLabel: 'M',   row: 1, group: 'broadstroke' },
  { key: 'week',  label: 'Weekly',   shortLabel: 'W',   row: 2, group: 'broadstroke' },
  { key: 'day',   label: 'Daily',    shortLabel: 'D',   row: 3, group: 'broadstroke' },
  { key: 'h4',    label: '4 Hour',   shortLabel: '4H',  row: 4, group: 'trigger' },
  { key: 'h1',    label: '1 Hour',   shortLabel: '1H',  row: 5, group: 'trigger' },
  { key: 'm15',   label: '15 Min',   shortLabel: '15m', row: 6, group: 'trigger' },
  { key: 'm5',    label: '5 Min',    shortLabel: '5m',  row: 7, group: 'trigger' },
];

// Timeframe weight for the grading system (how much each TF contributes to overall confidence)
const TF_GRADE_WEIGHTS = {
  month: 2,
  week: 5,
  day: 10,
  h4: 30,
  h1: 33,
  m15: 10,
  m5: 5,
};

// Grade thresholds from Excel
const GRADE_THRESHOLDS = [
  { grade: 'A', label: 'Very Good', min: 75, max: 84 },
  { grade: 'B', label: 'Good',      min: 60, max: 74 },
  { grade: 'C', label: 'Risky',     min: 50, max: 59 },
  { grade: 'D', label: 'Dangerous', min: 40, max: 49 },
  { grade: 'F', label: 'Fail',      min: -100, max: 39 },
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
// Each indicator input (+1/-1/0) is multiplied by its weight
function calcTimeframeScore(tfKey, indicators) {
  const w = WEIGHTS[tfKey];
  const buyScore =
    (indicators.close === 1 ? w.close : 0) +
    (indicators.macd === 1 ? w.macd : 0) +
    (indicators.rsi === 1 ? w.rsi : 0) +
    (indicators.boli === 1 ? w.boli : 0);
  const sellScore =
    (indicators.close === -1 ? w.close : 0) +
    (indicators.macd === -1 ? w.macd : 0) +
    (indicators.rsi === -1 ? w.rsi : 0) +
    (indicators.boli === -1 ? w.boli : 0);

  // Weighted total: positive values come from BUY weight, negative from SELL weight
  const total =
    (indicators.close * w.close) +
    (indicators.macd * w.macd) +
    (indicators.rsi * w.rsi) +
    (indicators.boli * w.boli);

  // Result: +1 if total > 0, -1 if total < 0, else check if any inputs exist
  let result = 0;
  if (total > 0) result = 1;
  else if (total < 0) result = -1;

  const bias = result === 1 ? 'BUY' : result === -1 ? 'SELL' : '';

  return { total, result, bias, buyScore, sellScore };
}

// Calculate the full bias analysis from inputs
function calculateBias(inputs) {
  const tfResults = {};
  
  // Step 1: Calculate each timeframe
  TIMEFRAMES.forEach(tf => {
    const indicators = inputs[tf.key] || { close: 0, macd: 0, rsi: 0, boli: 0 };
    tfResults[tf.key] = {
      ...calcTimeframeScore(tf.key, indicators),
      indicators,
    };
  });

  // Step 2: Deep Trend (Monthly result)
  const deepResult = tfResults.month.result;
  const deepTrend = deepResult === 1 ? 'BULL' : deepResult === -1 ? 'BEAR' : 'NEUTRAL';

  // Step 3: DD (Dominant Direction from M + W + D)
  const broadstrokeSum = tfResults.month.result + tfResults.week.result + tfResults.day.result;
  const ddResult = broadstrokeSum > 0 ? 1 : broadstrokeSum < 0 ? -1 : 0;
  const ddBias = ddResult === 1 ? 'BUY' : ddResult === -1 ? 'SELL' : 'NEUTRAL';

  // Step 4: Now (execution from 1hr + 15m + 5m)
  const nowSum = tfResults.h1.result + tfResults.m15.result + tfResults.m5.result;
  const nowResult = nowSum > 0 ? 1 : nowSum < 0 ? -1 : 0;
  const nowBias = nowResult === 1 ? 'BUY' : nowResult === -1 ? 'SELL' : 'NEUTRAL';

  // Step 5: Calculate grading - weighted score system
  // Each TF contributes its weight to POS or NEG bucket based on result alignment
  let posScore = 0;
  let negScore = 0;
  let lightsScore = 5; // base lights score from Excel

  TIMEFRAMES.forEach(tf => {
    const weight = TF_GRADE_WEIGHTS[tf.key];
    const result = tfResults[tf.key].result;
    if (result === 1) posScore += weight;
    else if (result === -1) negScore += weight;
  });

  // Direction determined by which side has more weight
  const mainDirection = posScore >= negScore ? 'BUY' : 'SELL';
  const confidenceScore = Math.max(posScore, negScore) + lightsScore;

  // Step 6: Determine grade
  let grade = 'F';
  let gradeLabel = 'Fail';
  for (const t of GRADE_THRESHOLDS) {
    if (confidenceScore >= t.min && confidenceScore <= t.max) {
      grade = t.grade;
      gradeLabel = t.label;
      break;
    }
  }
  // Handle F for scores above 85 (also F per Excel: "-40 +85" = Fail)
  if (confidenceScore > 84) {
    grade = 'F';
    gradeLabel = 'Fail';
  }

  // Step 7: Trend strength
  const allAligned = TIMEFRAMES.every(tf => tfResults[tf.key].result === (mainDirection === 'BUY' ? 1 : -1));
  const broadstrokeAligned = ['month', 'week', 'day'].every(k => tfResults[k].result === (mainDirection === 'BUY' ? 1 : -1));
  
  let strength = 'WEAK';
  if (allAligned) strength = 'STRONG';
  else if (broadstrokeAligned && Math.abs(broadstrokeSum) === 3) strength = 'STRONG';
  else if (Math.abs(broadstrokeSum) >= 2) strength = 'MEDIUM';

  // Step 8: Warnings
  const warnings = [];
  
  // Extended warning: all 7 timeframes aligned = overextended
  if (allAligned && confidenceScore >= 95) {
    warnings.push('EXTENDED - All timeframes aligned, market may be overextended');
  }
  
  // Mixed signals between broadstroke and trigger
  if (ddResult !== 0 && nowResult !== 0 && ddResult !== nowResult) {
    warnings.push('MIXED - Broadstroke and execution timeframes disagree');
  }

  // M5 deciding factor warning
  if (tfResults.m5.result !== 0 && tfResults.m5.result !== ddResult) {
    warnings.push('M5 against trend - wait for alignment or scalp only');
  }

  // No clear direction
  if (broadstrokeSum === 0) {
    warnings.push('No clear broadstroke direction - exercise caution');
  }

  // Step 9: Trade action
  let tradeAction = 'TRADE';
  let status = 'Ready';
  
  if (grade === 'F') {
    tradeAction = 'NO_TRADE';
    status = 'No Trade';
  } else if (grade === 'D') {
    tradeAction = 'WAIT';
    status = 'Dangerous';
  } else if (warnings.some(w => w.includes('MIXED'))) {
    tradeAction = 'WAIT';
    status = 'Wait';
  } else if (warnings.some(w => w.includes('EXTENDED'))) {
    tradeAction = 'WAIT';
    status = 'Extended';
  }

  // Step 10: Target recommendation from Excel notes
  let targetNote = '';
  if (grade === 'A') targetNote = 'A Target & Runner';
  else if (grade === 'B') targetNote = 'B Target';
  else if (grade === 'C') targetNote = 'C Target / Scalp';
  else if (grade === 'D') targetNote = 'Wait / Scalp only';

  return {
    timeframes: tfResults,
    deepTrend,
    deepResult,
    ddBias,
    ddResult,
    broadstrokeSum,
    nowBias,
    nowResult,
    nowSum,
    mainDirection,
    confidenceScore: Math.min(confidenceScore, 100),
    grade,
    gradeLabel,
    strength,
    warnings,
    tradeAction,
    status,
    targetNote,
    posScore,
    negScore,
  };
}

// Asset list from the Summary sheet
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
  C: 1.5,
  D: 3,
  scalp: 1.75,
  careful: 2.5,
};

// Get ATR for an asset, considering top 5 overrides
function getATRForAsset(asset, topAssets) {
  // Check if asset is in top 5 with override
  for (let i = 0; i < topAssets.length; i++) {
    if (topAssets[i].asset === asset && topAssets[i].atr) {
      return topAssets[i].atr;
    }
  }
  // Fall back to base ATR
  return BASE_ATR[asset] || 0;
}

// Calculate target price from ATR
function calculateTarget(atr, grade, status) {
  if (!atr || atr === 0) return null;
  
  const baseUnit = atr / 9;
  let target = null;
  let targetType = '';
  
  // Determine which target to use based on status first, then grade
  if (status === 'Scalp') {
    target = baseUnit / TARGET_WEIGHTS.scalp;
    targetType = 'Scalp';
  } else if (status === 'Careful') {
    target = baseUnit / TARGET_WEIGHTS.careful;
    targetType = 'Careful';
  } else if (grade === 'F') {
    target = baseUnit / TARGET_WEIGHTS.careful;
    targetType = 'Careful';
  } else if (grade === 'A') {
    target = baseUnit * TARGET_WEIGHTS.A;
    targetType = 'A';
  } else if (grade === 'B') {
    target = baseUnit * TARGET_WEIGHTS.B;
    targetType = 'B';
  } else if (grade === 'C') {
    target = baseUnit / TARGET_WEIGHTS.C;
    targetType = 'C';
  } else if (grade === 'D') {
    target = baseUnit / TARGET_WEIGHTS.D;
    targetType = 'D';
  }
  
  return { target: target ? parseFloat(target.toFixed(6)) : null, targetType };
}

export { TIMEFRAMES, WEIGHTS, TF_GRADE_WEIGHTS, GRADE_THRESHOLDS, ASSETS, BASE_ATR, TARGET_WEIGHTS, getDefaultInputs, calculateBias, getATRForAsset, calculateTarget };