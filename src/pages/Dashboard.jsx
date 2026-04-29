import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, MinusCircle, AlertTriangle } from 'lucide-react';

export default function Dashboard() {
  const [activeAssets, setActiveAssets] = useState({});
  const [timeToNextHour, setTimeToNextHour] = useState('');

  useEffect(() => {
    const load = () => {
      const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
      setActiveAssets(active);
    };
    load();
    window.addEventListener('biasUpdated', load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener('biasUpdated', load);
      window.removeEventListener('storage', load);
    };
  }, []);

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0);
      const diff = nextHour - now;
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeToNextHour(`${mins}m ${secs}s`);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const analyses = Object.values(activeAssets);

  if (analyses.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[80vh] text-center">
        <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center mb-4">
          <Crosshair className="w-10 h-10 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold mb-2">PrimeBias</h1>
        <p className="text-muted-foreground text-sm mb-6">Go to the Input tab to add assets for analysis</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight">PrimeBias</h1>
          <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <div className="text-right text-sm space-y-1">
          <div className="text-muted-foreground">{analyses.length} assets</div>
          <div className="space-y-0.5">
            <div className="text-[10px] text-muted-foreground">time left in hour</div>
            <div className="text-xs bg-secondary rounded px-2 py-1 font-mono text-primary">
              {timeToNextHour ? `↻ ${timeToNextHour}` : '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3">
          {analyses.map(a => (
            <AnalysisCard key={a.instrument} analysis={a} />
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground px-1">
          <strong>Grade:</strong> A–F confidence. <strong>Score:</strong> Absolute strength. <strong>DEEP/DD/NOW:</strong> Trend direction by timeframe.
        </p>
      </div>
    </div>
  );
}

function AnalysisCard({ analysis }) {
  const { instrument, results } = analysis;
  if (!results) return null;
  
  const { mainDirection, grade, gradeLabel, confidenceScore, tradeAction, strength, deepTrend, ddBias, nowBias, warnings } = results;
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
    <div className={cn('rounded-xl border border-border bg-card p-4 space-y-3', dirBg)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm">{instrument}</div>
          <div className={cn('text-[10px] uppercase tracking-wider', dirColor)}>{strength}</div>
        </div>
        <div className={cn('inline-flex items-center justify-center w-10 h-10 rounded-lg', 
          mainDirection === 'BUY' ? 'bg-emerald-500/20' : mainDirection === 'SELL' ? 'bg-red-500/20' : 'bg-secondary'
        )}>
          {mainDirection === 'BUY' ? <TrendingUp className="w-5 h-5 text-emerald-400" /> : mainDirection === 'SELL' ? <TrendingDown className="w-5 h-5 text-red-400" /> : <MinusCircle className="w-5 h-5" />}
        </div>
      </div>

      {/* Bias + Grade + Score Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('text-xl font-extrabold', dirColor)}>{mainDirection}</span>
        </div>
        <div className={cn('rounded-lg border p-2 text-center bg-card/50', gradeColors[grade])}>
          <div className="font-bold text-sm">{grade}</div>
          <div className="text-[8px] uppercase tracking-wider text-muted-foreground">{gradeLabel}</div>
        </div>
        <div className="rounded-lg border border-border bg-card/50 p-2 text-center">
          <div className="font-bold text-sm font-mono">{confidenceScore}</div>
          <div className="text-[8px] uppercase tracking-wider text-muted-foreground">Score</div>
        </div>
      </div>

      {/* Trends Compact */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="text-muted-foreground">
          <div className="text-[10px]">DEEP</div>
          <div className={deepTrend === 'BULL' ? 'text-emerald-400' : deepTrend === 'BEAR' ? 'text-red-400' : 'text-muted-foreground'} style={{fontSize: '11px', fontWeight: 'bold'}}>{deepTrend || '—'}</div>
        </div>
        <div className="text-muted-foreground">
          <div className="text-[10px]">DD</div>
          <div className={ddBias === 'BUY' ? 'text-emerald-400' : ddBias === 'SELL' ? 'text-red-400' : 'text-muted-foreground'} style={{fontSize: '11px', fontWeight: 'bold'}}>{ddBias || '—'}</div>
        </div>
        <div className="text-muted-foreground">
          <div className="text-[10px]">NOW</div>
          <div className={nowBias === 'BUY' ? 'text-emerald-400' : nowBias === 'SELL' ? 'text-red-400' : 'text-muted-foreground'} style={{fontSize: '11px', fontWeight: 'bold'}}>{nowBias || '—'}</div>
        </div>
      </div>

      {/* Action Badge */}
      <div className={cn('text-center py-1.5 rounded-lg text-xs font-bold', actionColors[tradeAction], tradeAction === 'WAIT' ? 'text-black' : 'text-white')}>
        {tradeAction === 'TRADE' ? 'TRADE' : tradeAction === 'WAIT' ? 'WAIT' : 'NO TRADE'}
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="flex items-start gap-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-2">
          <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0 mt-0.5" />
          <span className="text-[10px] text-yellow-300 leading-tight">{warnings[0]}</span>
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