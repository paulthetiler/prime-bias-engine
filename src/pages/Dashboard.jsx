import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, MinusCircle, AlertTriangle } from 'lucide-react';
import AssetsList from '@/components/bias/AssetsList';
import LiveGrid from '@/components/bias/LiveGrid';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const [activeAssets, setActiveAssets] = useState({});
  const [timeToNextHour, setTimeToNextHour] = useState('');
  const [viewMode, setViewMode] = useState('grid');

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
          variant={viewMode === 'grid' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('grid')}
          className="h-8 text-xs"
        >
          Grid
        </Button>
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
        {viewMode === 'grid' ? (
          <LiveGrid analyses={analyses} />
        ) : viewMode === 'list' ? (
          <AssetsList analyses={analyses} />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {analyses.map(a => (
              <AnalysisCard key={a.instrument} analysis={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AnalysisCard({ analysis }) {
  const { instrument, results } = analysis;
  if (!results) return null;
  
  const { mainDirection, grade, confidenceScore, tradeAction, deepTrend, ddBias, nowBias, warnings } = results;
  const dirColor = mainDirection === 'BUY' ? 'text-emerald-400' : mainDirection === 'SELL' ? 'text-red-400' : 'text-muted-foreground';
  const actionBg = tradeAction === 'TRADE' ? 'bg-emerald-500' : tradeAction === 'WAIT' ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Pair</div>
          <div className="text-lg font-bold text-foreground">{instrument}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground mb-1">Direction</div>
          <div className={cn('text-2xl font-black', dirColor)}>{mainDirection}</div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-3 border-t border-b border-border py-3">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Grade</div>
          <div className="text-xl font-bold text-foreground">{grade}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Score</div>
          <div className="text-xl font-mono font-bold text-foreground">{confidenceScore}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Action</div>
          <div className={cn('inline-block px-2 py-1 rounded text-xs font-bold text-white', actionBg)}>
            {tradeAction}
          </div>
        </div>
      </div>

      {/* Trends */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Deep</div>
          <div className="text-sm font-semibold text-foreground">{deepTrend || '—'}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">DD</div>
          <div className="text-sm font-semibold text-foreground">{ddBias || '—'}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Now</div>
          <div className="text-sm font-semibold text-foreground">{nowBias || '—'}</div>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 text-[10px] text-amber-300">
          ⚠ {warnings[0]}
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