import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, MinusCircle, AlertTriangle } from 'lucide-react';
import AssetsList from '@/components/bias/AssetsList';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const [activeAssets, setActiveAssets] = useState({});
  const [timeToNextHour, setTimeToNextHour] = useState('');
  const [viewMode, setViewMode] = useState('list');

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

      <div className="flex gap-2 mb-3">
        <Button
          variant={viewMode === 'list' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('list')}
          className="h-8 text-xs"
        >
          List
        </Button>
        <Button
          variant={viewMode === 'cards' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('cards')}
          className="h-8 text-xs"
        >
          Cards
        </Button>
      </div>

      <div className="space-y-3">
        {viewMode === 'list' ? (
          <AssetsList analyses={analyses} />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {analyses.map(a => (
              <AnalysisCard key={a.instrument} analysis={a} />
            ))}
          </div>
        )}
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
  
  const { mainDirection, grade, confidenceScore, tradeAction, deepTrend, ddBias, nowBias, warnings } = results;
  const dirColor = mainDirection === 'BUY' ? 'text-emerald-400' : mainDirection === 'SELL' ? 'text-red-400' : 'text-muted-foreground';
  const dirBorder = mainDirection === 'BUY' ? 'border-emerald-500/20' : mainDirection === 'SELL' ? 'border-red-500/20' : 'border-border';
  const actionColors = { TRADE: 'bg-emerald-500', WAIT: 'bg-yellow-500', NO_TRADE: 'bg-red-500' };

  return (
    <div className={cn('rounded-lg border bg-card/70 backdrop-blur-sm p-4 space-y-3', dirBorder)}>
      {/* Instrument Name */}
      <div className="font-semibold text-sm text-foreground">{instrument}</div>

      {/* Main Direction - Dominant Element */}
      <div className="flex items-center justify-between">
        <div className={cn('text-4xl font-black', dirColor)}>
          {mainDirection}
        </div>
        <div className={cn('inline-flex items-center justify-center w-12 h-12 rounded-lg', 
          mainDirection === 'BUY' ? 'bg-secondary' : mainDirection === 'SELL' ? 'bg-secondary' : 'bg-secondary'
        )}>
          {mainDirection === 'BUY' ? <TrendingUp className="w-6 h-6 text-foreground" /> : mainDirection === 'SELL' ? <TrendingDown className="w-6 h-6 text-foreground" /> : <MinusCircle className="w-6 h-6 text-foreground" />}
        </div>
      </div>

      {/* Confidence + Score Row */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Grade:</span>
          <span className="font-bold text-foreground">{grade}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Score:</span>
          <span className="font-mono font-bold text-foreground">{confidenceScore}</span>
        </div>
      </div>

      {/* Trends Grouped */}
      <div className="text-xs space-y-1 py-1 border-t border-border/50">
        <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Trend</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-muted-foreground text-[9px]">Deep</div>
            <div className={cn('font-semibold', deepTrend === 'BULL' ? 'text-emerald-400' : deepTrend === 'BEAR' ? 'text-red-400' : 'text-muted-foreground')}>
              {deepTrend || '—'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground text-[9px]">DD</div>
            <div className={cn('font-semibold', ddBias === 'BUY' ? 'text-emerald-400' : ddBias === 'SELL' ? 'text-red-400' : 'text-muted-foreground')}>
              {ddBias || '—'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground text-[9px]">Now</div>
            <div className={cn('font-semibold', nowBias === 'BUY' ? 'text-emerald-400' : nowBias === 'SELL' ? 'text-red-400' : 'text-muted-foreground')}>
              {nowBias || '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className={cn('text-center py-2 rounded-lg text-sm font-bold', actionColors[tradeAction], tradeAction === 'WAIT' ? 'text-black' : 'text-white')}>
        {tradeAction === 'TRADE' ? 'TRADE' : tradeAction === 'WAIT' ? 'WAIT' : 'NO TRADE'}
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded p-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
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