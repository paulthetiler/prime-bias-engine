import React, { useMemo } from 'react';
import { calculateBias } from '@/lib/biasEngine';
import { cn } from '@/lib/utils';

// ── 5 Excel test cases ──────────────────────────────────────────────────────
const TEST_CASES = [
  {
    name: 'Bias Tool (GBP/USD)',
    inputs: {
      month: { close: -1, macd: -1, rsi: 0, boli: 0 },
      week:  { close: -1, macd:  1, rsi: 0, boli: 0 },
      day:   { close: -1, macd: -1, rsi: 0, boli: 0 },
      h4:    { close: -1, macd: -1, rsi: 1, boli: 0 },
      h1:    { close:  0, macd:  0, rsi: 0, boli: 0 },
      m15:   { close:  0, macd:  1, rsi: 1, boli: 0 },
      m5:    { close:  0, macd:  1, rsi: 1, boli: 0 },
    },
    expected: { deep: 'BEAR / MEDIUM', dd: 'SELL / WEAK', now: 'BUY / WEAK', direction: 'SELL', score: 42, grade: 'D' },
  },
  {
    name: 'B1 (All BUY)',
    inputs: {
      month: { close:  1, macd:  1, rsi: 0, boli:  1 },
      week:  { close: -1, macd:  1, rsi: 0, boli:  1 },
      day:   { close:  1, macd: -1, rsi: 0, boli:  1 },
      h4:    { close:  1, macd:  1, rsi: 1, boli:  1 },
      h1:    { close:  0, macd:  1, rsi: 1, boli:  0 },
      m15:   { close:  0, macd:  1, rsi: 1, boli:  1 },
      m5:    { close:  0, macd:  1, rsi:-1, boli:  1 },
    },
    expected: { deep: 'BULL / STRONG', dd: 'BUY / STRONG', now: 'BUY / STRONG', direction: 'BUY', score: 95, grade: 'F (Ext)' },
  },
  {
    name: 'B2 (SELL biased)',
    inputs: {
      month: { close: -1, macd: -1, rsi: -1, boli:  1 },
      week:  { close: -1, macd: -1, rsi:  0, boli:  0 },
      day:   { close:  1, macd: -1, rsi:  0, boli:  0 },
      h4:    { close:  1, macd:  1, rsi: -1, boli:  1 },
      h1:    { close:  0, macd: -1, rsi: -1, boli:  0 },
      m15:   { close:  0, macd: -1, rsi:  1, boli: -1 },
      m5:    { close:  0, macd: -1, rsi:  1, boli:  0 },
    },
    expected: { deep: 'BEAR / STRONG', dd: 'SELL / MEDIUM', now: 'SELL / MEDIUM', direction: 'SELL', score: 60, grade: 'B' },
  },
  {
    name: 'B3 (Mixed)',
    inputs: {
      month: { close: -1, macd:  1, rsi: 0, boli:  1 },
      week:  { close:  1, macd: -1, rsi: 0, boli: -1 },
      day:   { close: -1, macd: -1, rsi: 0, boli: -1 },
      h4:    { close:  1, macd: -1, rsi: 1, boli:  1 },
      h1:    { close:  0, macd: -1, rsi: 1, boli: -1 },
      m15:   { close:  0, macd:  1, rsi: 1, boli:  0 },
      m5:    { close:  0, macd:  1, rsi:-1, boli:  0 },
    },
    expected: { deep: 'BEAR / MEDIUM', dd: 'SELL / MEDIUM', now: 'SELL / MEDIUM', direction: 'SELL', score: 53, grade: 'C' },
  },
  {
    name: 'B4 (Strong BUY)',
    inputs: {
      month: { close:  1, macd:  0, rsi: 0, boli:  0 },
      week:  { close: -1, macd:  1, rsi: 1, boli:  1 },
      day:   { close:  1, macd:  1, rsi: 0, boli:  1 },
      h4:    { close:  1, macd:  1, rsi:-1, boli:  1 },
      h1:    { close:  0, macd:  1, rsi:-1, boli:  1 },
      m15:   { close:  0, macd:  1, rsi: 1, boli:  1 },
      m5:    { close:  0, macd: -1, rsi: 1, boli:  0 },
    },
    expected: { deep: 'BULL / STRONG', dd: 'BUY / STRONG', now: 'BUY / STRONG', direction: 'BUY', score: 95, grade: 'F (Ext)' },
  },
  {
    name: 'NOW Regression — H1 conflicts (→ WEAK)',
    inputs: {
      // H1=BUY, M15=SELL, M5=SELL → NOW direction=SELL (majority), but H1 conflicts → WEAK
      month: { close: -1, macd: -1, rsi: 0, boli: 0 },
      week:  { close: -1, macd: -1, rsi: 0, boli: 0 },
      day:   { close: -1, macd: -1, rsi: 0, boli: 0 },
      h4:    { close: -1, macd: -1, rsi: 0, boli: 0 },
      // H1 → BUY: macd+1, rsi+1 → score = 20+40 = +60 → BUY
      h1:    { close:  0, macd:  1, rsi: 1, boli: 0 },
      // M15 → SELL: macd-1, boli-1 → score = -20-40 = -60 → SELL
      m15:   { close:  0, macd: -1, rsi: 0, boli: -1 },
      // M5 → SELL: macd-1, boli-1 → score = -10-40 = -50 → SELL
      m5:    { close:  0, macd: -1, rsi: 0, boli: -1 },
    },
    expected: { deep: 'BEAR / STRONG', dd: 'SELL / MEDIUM', now: 'SELL / WEAK', direction: 'SELL', score: 60, grade: 'B' },
  },
];

function match(actual, expected) {
  return actual?.toString().toLowerCase().includes(expected?.toString().toLowerCase());
}

export default function EngineTest() {
  const results = useMemo(() => TEST_CASES.map(tc => {
    const r = calculateBias(tc.inputs, null);
    return { tc, r };
  }), []);

  const allPass = results.every(({ tc, r }) => {
    const [expDeepDir, expDeepStr] = tc.expected.deep.split(' / ');
    const [expDdDir, expDdStr] = tc.expected.dd.split(' / ');
    const [expNowDir, expNowStr] = tc.expected.now.split(' / ');
    const gradeVal = r.grade + (r.gradeLabel === 'Extended' ? ' (Ext)' : '');
    return match(r.deepTrend, expDeepDir) && match(r.deepStrength, expDeepStr)
      && match(r.ddBias, expDdDir) && match(r.ddStrength, expDdStr)
      && match(r.nowBias, expNowDir) && match(r.nowStrength, expNowStr)
      && match(r.mainDirection, tc.expected.direction)
      && r.winningScore === tc.expected.score
      && match(gradeVal, tc.expected.grade);
  });

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3 pt-2">
        <h1 className="text-lg font-bold">Engine Test — 6 Excel Cases</h1>
        <span className={cn('text-xs font-bold px-2 py-1 rounded', allPass ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
          {allPass ? '✓ ALL PASS' : '✗ FAILURES DETECTED'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">Green = matches Excel. Red = mismatch (expected value shown below).</p>
      <p className="text-[10px] text-muted-foreground">Route: /admin/engine-test</p>

      {results.map(({ tc, r }) => {
        const [expDeepDir, expDeepStr] = tc.expected.deep.split(' / ');
        const [expDdDir, expDdStr] = tc.expected.dd.split(' / ');
        const [expNowDir, expNowStr] = tc.expected.now.split(' / ');
        const gradeVal = r.grade + (r.gradeLabel === 'Extended' ? ' (Ext)' : '');

        const checks = [
          { label: 'DEEP', got: `${r.deepTrend} / ${r.deepStrength}`, ok: match(r.deepTrend, expDeepDir) && match(r.deepStrength, expDeepStr), exp: tc.expected.deep },
          { label: 'DD',   got: `${r.ddBias} / ${r.ddStrength}`,   ok: match(r.ddBias, expDdDir) && match(r.ddStrength, expDdStr),   exp: tc.expected.dd },
          { label: 'NOW',  got: `${r.nowBias} / ${r.nowStrength}`,  ok: match(r.nowBias, expNowDir) && match(r.nowStrength, expNowStr),  exp: tc.expected.now },
          { label: 'DIR',  got: r.mainDirection, ok: match(r.mainDirection, tc.expected.direction), exp: tc.expected.direction },
          { label: 'SCORE', got: String(r.winningScore), ok: r.winningScore === tc.expected.score, exp: String(tc.expected.score) },
          { label: 'GRADE', got: gradeVal, ok: match(gradeVal, tc.expected.grade), exp: tc.expected.grade },
        ];
        const casePass = checks.every(c => c.ok);

        return (
          <div key={tc.name} className={cn('rounded-lg border p-3 space-y-2', casePass ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5')}>
            <div className="flex items-center gap-2">
              <span className={cn('text-[10px] font-bold', casePass ? 'text-emerald-400' : 'text-red-400')}>{casePass ? '✓' : '✗'}</span>
              <span className="text-xs font-bold text-foreground">{tc.name}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">BUY={r.buyScore} SELL={r.sellScore}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {checks.map(c => (
                <div key={c.label} className={cn('rounded p-2 text-center', c.ok ? 'bg-emerald-500/10' : 'bg-red-500/10')}>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
                  <div className={cn('text-[11px] font-mono font-bold mt-0.5', c.ok ? 'text-emerald-400' : 'text-red-400')}>{c.got}</div>
                  {!c.ok && <div className="text-[9px] text-muted-foreground mt-0.5">exp: {c.exp}</div>}
                </div>
              ))}
            </div>
            <div className="flex gap-1 flex-wrap pt-1">
              {['month','week','day','h4','h1','m15','m5'].map(key => {
                const tf = r.timeframes[key];
                return (
                  <div key={key} className={cn('text-[9px] font-mono rounded px-1.5 py-0.5',
                    tf.result === 1  ? 'bg-emerald-500/20 text-emerald-400' :
                    tf.result === -1 ? 'bg-red-500/20 text-red-400' : 'bg-secondary text-muted-foreground'
                  )}>
                    {key.toUpperCase()}: {tf.bias[0]}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}