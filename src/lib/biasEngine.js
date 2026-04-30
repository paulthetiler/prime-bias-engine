// PrimeBias Engine — verified against Excel workbook (Bias Tool + B1/B2/B3/B4)
//
// CONFIRMED RULES (cell-by-cell verification):
//
// TF DIRECTION: weighted sum of indicators → +1 (BUY) / -1 (SELL) / 0 (Neutral)
//   Weights: Month{close:40,macd:30,rsi:10,boli:20}  Week{close:30,macd:40,rsi:10,boli:20}
//            Day{close:35,macd:40,rsi:10,boli:15}     H4{close:25,macd:20,rsi:20,boli:35}
//            H1{close:0,macd:20,rsi:40,boli:40}       M15{close:0,macd:20,rsi:40,boli:40}
//            M5{close:0,macd:10,rsi:30,boli:40}  ← rsi=30 NOT 50 (confirmed B1 M5 case)
//   Tiebreaker (sum=0): indicator majority vote
//
// BLOCKS:
//   DEEP = [Month, Week, Day]   → direction = majority; Month anchors
//   DD   = [Day, H4, H1]        → direction = majority; Day anchors
//   NOW  = [H1, M15, M5]        → direction = majority; H1 anchors
//
// BLOCK STRENGTH (confirmed from all 5 examples):
//   3 matching                   → STRONG
//   2 matching + 1 OPPOSITE      → MEDIUM
//   2 matching + 1 NEUTRAL (0)   → WEAK
//
// GRADE SCORING (individual TF weights, BUY vs SELL tally):
//   Month=2, Week=5, Day=10, H4=30, H1=33, M15=10, M5=5  (base total = 95)
//   ExtraCheck green light adds +5 to matching direction  (max = 100)
//
// GRADE THRESHOLDS:
//   ≥90 → F (Extended)    ≥85 → C (Risky)    ≥75 → A
//   ≥60 → B               ≥50 → C             ≥40 → D    <40 → F
//
// MAIN DIRECTION = score direction (whichever of BUY/SELL wins the weighted tally)
//
// GRADE CAP: If Deep direction conflicts with score direction → effective grade capped at C
//
// TEST RESULTS vs EXCEL:
//   Bias Tool: M(-1),W(+1),D(-1),H4(-1),H1(0),M15(+1),M5(+1)
//     SELL=42(M2+D10+H4 30), BUY=20(W5+M15 10+M5 5) → SELL wins, score=42→grade D ✓
//     Deep=[−1,+1,−1]→SELL,MEDIUM ✓  DD=[−1,−1,0]→SELL,WEAK ✓  Now=[0,+1,+1]→BUY,WEAK ✓
//   B1: all BUY (M5: macd+1,rsi−1,boli+1 → 10−30+40=+20 →BUY ✓)
//     BUY=95,SELL=0 → score=95→F(Extended) ✓
//   B2: M(−1),W(−1),D(−1),H4(+1),H1(−1),M15(−1),M5(?)
//     M5: macd−1,rsi+1,boli0 → −10+30=+20→BUY(+1)
//     SELL=2+5+10+33+10=60, BUY=30+5=35 → SELL wins, score=60→grade B ✓
//     DD=[−1,+1,−1]→SELL,MEDIUM ✓  Now=[−1,−1,+1]→SELL,MEDIUM ✓
//   B3: M(+1),W(−1),D(−1),H4(+1),H1(−1),M15(+1),M5(?)
//     M5: macd+1,rsi−1,boli0 → 10−30=−20→SELL(−1)
//     SELL=5+10+33+5=53, BUY=2+30+10=42 → SELL wins, score=53→grade C ✓
//     Deep=[+1,−1,−1]→SELL,MEDIUM ✓  DD=[−1,+1,−1]→SELL,MEDIUM ✓
//   B4: M(+1),W(+1),D(+1),H4(+1),H1(+1),M15(+1),M5(?)
//     M5: macd−1,rsi+1,boli0 → −10+30=+20→BUY(+1)
//     BUY=2+5+10+30+33+10+5=95,SELL=0 → score=95→F(Extended) ✓
//     Deep=[+1,+1,+1]→BULL,STRONG ✓  DD=[+1,+1,+1]→BUY,STRONG ✓  Now=[+1,+1,+1]→BUY,STRONG ✓

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

// Per-indicator weights — used ONLY to determine each TF's direction (+1/-1/0)
const WEIGHTS = {
  month: { close: 40, macd: 30, rsi: 10, boli: 20 },
  week:  { close: 30, macd: 40, rsi: 10, boli: 20 },
  day:   { close: 35, macd: 40, rsi: 10, boli: 15 },
  h4:    { close: 25, macd: 20, rsi: 20, boli: 35 },
  h1:    { close: 0,  macd: 20, rsi: 40, boli: 40 },
  m15:   { close: 0,  macd: 20, rsi: 40, boli: 40 },
  m5:    { close: 0,  macd: 10, rsi: 30, boli: 40 }, // rsi=30 confirmed
};

// Grade scoring weights — used for BUY vs SELL point tally
const TF_SCORE_WEIGHTS = {
  month: 2, week: 5, day: 10, h4: 30, h1: 33, m15: 10, m5: 5,
};
const LIGHTS_WEIGHT = 5;

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
// Weighted sum → sign. If sum = 0, tiebreak by indicator majority.
function calcTFResult(tfKey, ind) {
  const w = WEIGHTS[tfKey];
  const total = (ind.close * w.close) + (ind.macd * w.macd) + (ind.rsi * w.rsi) + (ind.boli * w.boli);
  if (total > 0) return 1;
  if (total < 0) return -1;
  // tiebreak
  const pos = [ind.close, ind.macd, ind.rsi, ind.boli].filter(v => v > 0).length;
  const neg = [ind.close, ind.macd, ind.rsi, ind.boli].filter(v => v < 0).length;
  if (pos > neg) return 1;
  if (neg > pos) return -1;
  return 0;
}

// ─── Block direction ──────────────────────────────────────────────────────────
function calcBlockDir(r0, r1, r2) {
  const pos = [r0, r1, r2].filter(r => r === 1).length;
  const neg = [r0, r1, r2].filter(r => r === -1).length;
  if (pos > neg) return 1;
  if (neg > pos) return -1;
  return 0;
}

// ─── Block strength ───────────────────────────────────────────────────────────
// Confirmed rule (all 5 Excel examples verified):
//   3 matching                → STRONG
//   2 matching + 1 opposite   → MEDIUM
//   2 matching + 1 neutral    → WEAK
function calcBlockStrength(r0, r1, r2, dir) {
  if (dir === 0) return 'NO TRADE';
  const matches  = [r0, r1, r2].filter(r => r === dir).length;
  const neutrals = [r0, r1, r2].filter(r => r === 0).length;
  if (matches === 3)                        return 'STRONG';
  if (matches === 2 && neutrals === 0)      return 'MEDIUM'; // 1 opposite
  if (matches === 2 && neutrals >= 1)       return 'WEAK';   // 1 neutral
  return 'WEAK'; // fallback (1 match — shouldn't occur for non-zero dir)
}

// ─── Grade ────────────────────────────────────────────────────────────────────
// Thresholds confirmed from Excel:
//   ≥90→F(Extended), ≥85→C(Risky), ≥75→A, ≥60→B, ≥50→C, ≥40→D, <40→F
function calcGrade(score) {
  if (score >= 90) return 'F';
  if (score >= 85) return 'C';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function calcGradeLabel(grade, score) {
  if (score >= 90) return 'Extended';
  if (score >= 85) return 'Risky';
  if (grade === 'A') return 'Very Good';
  if (grade === 'B') return 'Good';
  if (grade === 'C') return 'Risky';
  if (grade === 'D') return 'Dangerous';
  return 'No Trade';
}

// ─── Main calculation ─────────────────────────────────────────────────────────
function calculateBias(inputs, extraCheck = null) {
  // 1. TF directions
  const tfResults = {};
  TIMEFRAMES.forEach(tf => {
    const ind = inputs[tf.key] || { close: 0, macd: 0, rsi: 0, boli: 0 };
    const result = calcTFResult(tf.key, ind);
    const w = WEIGHTS[tf.key];
    const total = (ind.close * w.close) + (ind.macd * w.macd) + (ind.rsi * w.rsi) + (ind.boli * w.boli);
    tfResults[tf.key] = {
      result,
      total,
      bias: result === 1 ? 'BUY' : result === -1 ? 'SELL' : 'Neutral',
    };
  });
  const r = key => tfResults[key].result;

  // 2. DEEP block [Month, Week, Day]
  const deepDir      = calcBlockDir(r('month'), r('week'), r('day'));
  const deepTrend    = deepDir === 1 ? 'BULL' : deepDir === -1 ? 'BEAR' : 'NEUTRAL';
  const deepStrength = calcBlockStrength(r('month'), r('week'), r('day'), deepDir);

  // 3. DD block [Day, H4, H1]
  const ddDir      = calcBlockDir(r('day'), r('h4'), r('h1'));
  const ddBias     = ddDir === 1 ? 'BUY' : ddDir === -1 ? 'SELL' : 'NEUTRAL';
  const ddStrength = calcBlockStrength(r('day'), r('h4'), r('h1'), ddDir);

  // 4. NOW block [H1, M15, M5]
  const nowDir      = calcBlockDir(r('h1'), r('m15'), r('m5'));
  const nowBias     = nowDir === 1 ? 'BUY' : nowDir === -1 ? 'SELL' : 'NEUTRAL';
  const nowStrength = calcBlockStrength(r('h1'), r('m15'), r('m5'), nowDir);

  // 5. Grade score — individual TF weights
  let buyScore = 0, sellScore = 0;
  TIMEFRAMES.forEach(tf => {
    const res = r(tf.key);
    const w   = TF_SCORE_WEIGHTS[tf.key];
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

  // 6. Score direction = main direction
  let scoreDirection;
  if      (buyScore > sellScore)  scoreDirection = 'BUY';
  else if (sellScore > buyScore)  scoreDirection = 'SELL';
  else {
    // Tie — tiebreak with Monthly
    if      (r('month') === 1)  scoreDirection = 'BUY';
    else if (r('month') === -1) scoreDirection = 'SELL';
    else                         scoreDirection = 'NEUTRAL';
  }

  const winningScore  = scoreDirection === 'BUY'  ? buyScore
                      : scoreDirection === 'SELL' ? sellScore : 0;
  const mainDirection = scoreDirection === 'NEUTRAL' ? 'BUY' : scoreDirection;
  const dir           = mainDirection === 'BUY' ? 1 : -1;

  // 7. Raw grade
  const rawGrade = calcGrade(winningScore);

  // 8. Effective grade — cap at C if Deep conflicts with score direction
  const deepMatchesScore =
    deepDir === 0 ||
    (deepDir === 1  && scoreDirection === 'BUY') ||
    (deepDir === -1 && scoreDirection === 'SELL');
  const effectiveGrade = deepMatchesScore ? rawGrade : 'C';

  // 9. Status / action
  const nowMatchesScore = nowDir === dir;
  const ddMatchesScore  = ddDir  === dir;
  let status, tradeAction, targetNote;

  if (effectiveGrade === 'F' && winningScore >= 90) {
    status = 'Extended'; tradeAction = 'NO_TRADE'; targetNote = 'EXTENDED';
  } else if (effectiveGrade === 'F') {
    status = 'No Trade'; tradeAction = 'NO_TRADE'; targetNote = 'NO TRADE';
  } else if (effectiveGrade === 'D') {
    status = 'Dangerous'; tradeAction = 'WAIT'; targetNote = 'WAIT';
  } else if (effectiveGrade === 'C' && !deepMatchesScore) {
    status = 'Wait'; tradeAction = 'WAIT'; targetNote = 'WAIT';
  } else if (effectiveGrade === 'A') {
    status      = nowMatchesScore ? 'Ready'    : 'Trend Off';
    tradeAction = nowMatchesScore ? 'TRADE'    : 'WAIT';
    targetNote  = nowMatchesScore ? `GOOD ${mainDirection}` : 'WAIT';
  } else if (effectiveGrade === 'B') {
    status      = nowMatchesScore ? 'Ready'    : 'Monitor';
    tradeAction = nowMatchesScore ? 'TRADE'    : 'WAIT';
    targetNote  = nowMatchesScore ? `MED ${mainDirection}` : 'WAIT';
  } else {
    // C
    if (!ddMatchesScore) {
      status = 'Trend Off'; tradeAction = 'WAIT';  targetNote = 'WAIT';
    } else {
      status = 'Scalp';     tradeAction = 'TRADE'; targetNote = `SCALP ${mainDirection}`;
    }
  }

  // 10. Warnings
  const warnings = [];
  if (deepDir !== 0 && !deepMatchesScore)
    warnings.push('Deep Trend conflicts with score direction — grade capped at C');
  if (ddDir !== 0 && nowDir !== 0 && ddDir !== nowDir)
    warnings.push('NOW momentum is OPPOSITE to DD — momentum conflict');
  if (ddDir === 0)
    warnings.push('DD block is NEUTRAL — execution zone has no clear trend');
  if (deepDir === 0)
    warnings.push('Deep Trend is NEUTRAL — no macro direction confirmed');
  if (winningScore >= 90)
    warnings.push('Score ≥90 — market EXTENDED, high reversal risk');
  else if (winningScore >= 85)
    warnings.push('Score 85-89 — approaching extended territory, use caution');

  const plusMinusScore  = r('h1') + r('m15') + r('m5');
  const alignedCount    = TIMEFRAMES.filter(tf => r(tf.key) === dir).length;
  const confidenceScore = Math.round((alignedCount / TIMEFRAMES.length) * 100);
  const gradeLabel      = calcGradeLabel(effectiveGrade, winningScore);

  return {
    timeframes: tfResults,
    deepTrend, deepResult: deepDir, deepStrength,
    ddBias, ddResult: ddDir, ddStrength,
    nowBias, nowResult: nowDir, nowStrength,
    buyScore, sellScore, winningScore, plusMinusScore, lightsActive,
    mainDirection, scoreDirection,
    grade: effectiveGrade, gradeLabel, strength: ddStrength,
    tradeAction, status, targetNote,
    confidenceScore, warnings,
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

// Legacy compat
const GRADE_THRESHOLDS = [];
const TF_GRADE_WEIGHTS = {};

export {
  TIMEFRAMES, WEIGHTS, TF_GRADE_WEIGHTS, GRADE_THRESHOLDS,
  ASSETS, BASE_ATR, TARGET_WEIGHTS,
  getDefaultInputs, calculateBias, getATRForAsset, calculateTarget,
};