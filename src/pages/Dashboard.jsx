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
  const dirBg = mainDirection === 'BUY' ? 'bg-emerald-500' : mainDirection === 'SELL' ? 'bg-red-500' : 'bg-gray-500';
  const actionBg = tradeAction === 'TRADE' ? 'bg-emerald-500' : tradeAction === 'WAIT' ? 'bg-yellow-400' : 'bg-red-500';

  return (
    <div className="border-2 border-black bg-white space-y-0">
      {/* Header: Instrument + Direction */}
      <div className="flex border-b-2 border-black">
        <div className="flex-1 bg-yellow-400 text-black border-r-2 border-black p-2 font-bold text-sm">
          {instrument}
        </div>
        <div className={cn('flex-1 text-white font-black text-lg flex items-center justify-center py-2', dirBg)}>
          {mainDirection}
        </div>
      </div>

      {/* Grade / Score Row */}
      <div className="flex border-b-2 border-black">
        <div className="flex-1 bg-cyan-400 text-black border-r-2 border-black p-2 font-bold text-sm text-center">
          Grade: {grade}
        </div>
        <div className="flex-1 bg-cyan-400 text-black p-2 font-bold text-sm text-center">
          Score: {confidenceScore}
        </div>
      </div>

      {/* Trends Row */}
      <div className="flex border-b-2 border-black text-center text-xs font-bold">
        <div className="flex-1 bg-yellow-400 text-black border-r-2 border-black p-1.5">
          Deep<br/>{deepTrend || '—'}
        </div>
        <div className="flex-1 bg-yellow-400 text-black border-r-2 border-black p-1.5">
          DD<br/>{ddBias || '—'}
        </div>
        <div className="flex-1 bg-yellow-400 text-black p-1.5">
          Now<br/>{nowBias || '—'}
        </div>
      </div>

      {/* Action Button */}
      <div className={cn('text-center py-2 text-white font-black text-sm', actionBg)}>
        {tradeAction === 'TRADE' ? 'TRADE' : tradeAction === 'WAIT' ? 'WAIT' : 'NO TRADE'}
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-yellow-300 text-black border-t-2 border-black p-2 text-[10px] font-bold">
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