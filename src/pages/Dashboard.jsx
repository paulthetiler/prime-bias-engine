import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, MinusCircle, AlertTriangle } from 'lucide-react';

export default function Dashboard() {
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('primebias_current');
    if (stored) setAnalysis(JSON.parse(stored));
  }, []);

  // Listen for updates from input page
  useEffect(() => {
    const handler = () => {
      const stored = localStorage.getItem('primebias_current');
      if (stored) setAnalysis(JSON.parse(stored));
    };
    window.addEventListener('storage', handler);
    window.addEventListener('biasUpdated', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('biasUpdated', handler);
    };
  }, []);

  if (!analysis || !analysis.results) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[80vh] text-center">
        <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center mb-4">
          <Crosshair className="w-10 h-10 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold mb-2">PrimeBias</h1>
        <p className="text-muted-foreground text-sm mb-6">Go to the Input tab to start your first bias analysis</p>
      </div>
    );
  }

  const { instrument, results } = analysis;
  const { mainDirection, grade, gradeLabel, confidenceScore, tradeAction, status, strength, deepTrend, ddBias, nowBias, warnings, targetNote } = results;

  const dirColor = mainDirection === 'BUY' ? 'text-emerald-400' : mainDirection === 'SELL' ? 'text-red-400' : 'text-muted-foreground';
  const dirBg = mainDirection === 'BUY' ? 'from-emerald-500/20 to-emerald-500/5' : mainDirection === 'SELL' ? 'from-red-500/20 to-red-500/5' : 'from-secondary to-secondary/50';

  const gradeColors = {
    A: 'text-emerald-400 border-emerald-500/40',
    B: 'text-blue-400 border-blue-500/40',
    C: 'text-yellow-400 border-yellow-500/40',
    D: 'text-orange-400 border-orange-500/40',
    F: 'text-red-400 border-red-500/40',
  };

  const actionColors = { TRADE: 'bg-emerald-500', WAIT: 'bg-yellow-500', NO_TRADE: 'bg-red-500' };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight">PrimeBias</h1>
          <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold">{instrument}</div>
          <div className={cn('text-[10px] uppercase tracking-wider', dirColor)}>{strength}</div>
        </div>
      </div>

      {/* Hero Card */}
      <div className={cn('rounded-2xl bg-gradient-to-b p-6 text-center border border-border', dirBg)}>
        <div className="flex items-center justify-center gap-3 mb-2">
          {mainDirection === 'BUY' ? <TrendingUp className="w-8 h-8 text-emerald-400" /> : mainDirection === 'SELL' ? <TrendingDown className="w-8 h-8 text-red-400" /> : <MinusCircle className="w-8 h-8" />}
          <span className={cn('text-4xl font-extrabold tracking-tight', dirColor)}>{mainDirection}</span>
        </div>
        <div className="text-sm text-muted-foreground mb-4">{strength} • {status}</div>
        
        <div className={cn('inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold', actionColors[tradeAction], tradeAction === 'WAIT' ? 'text-black' : 'text-white')}>
          {tradeAction === 'TRADE' ? 'TRADE' : tradeAction === 'WAIT' ? 'WAIT' : 'NO TRADE'}
        </div>
      </div>

      {/* Score Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className={cn('rounded-xl border-2 p-4 text-center bg-card', gradeColors[grade])}>
          <div className="text-4xl font-black">{grade}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{gradeLabel}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-4xl font-black font-mono">{confidenceScore}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Confidence</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-lg font-bold text-muted-foreground mt-2">{targetNote || '—'}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Target</div>
        </div>
      </div>

      {/* Trend Breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <TrendCard label="DEEP" value={deepTrend} />
        <TrendCard label="DD" value={ddBias} />
        <TrendCard label="NOW" value={nowBias} />
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3">
              <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
              <span className="text-xs text-yellow-300">{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Crosshair(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" /><line x1="22" y1="12" x2="18" y2="12" /><line x1="6" y1="12" x2="2" y2="12" /><line x1="12" y1="6" x2="12" y2="2" /><line x1="12" y1="22" x2="12" y2="18" />
    </svg>
  );
}

function TrendCard({ label, value }) {
  const color = value === 'BUY' || value === 'BULL' ? 'text-emerald-400' : value === 'SELL' || value === 'BEAR' ? 'text-red-400' : 'text-muted-foreground';
  return (
    <div className="rounded-xl bg-card border border-border p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={cn('text-sm font-bold', color)}>{value || 'NEUTRAL'}</div>
    </div>
  );
}