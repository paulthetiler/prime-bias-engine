import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, MinusCircle, AlertTriangle, Trash2, Edit2 } from 'lucide-react';
import AssetsList from '@/components/bias/AssetsList';
import LiveGrid from '@/components/bias/LiveGrid';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeAssets, setActiveAssets] = useState({});
  const [timeToNextHour, setTimeToNextHour] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const handlePullRefresh = (e) => {
    const touch = e.touches[0];
    if (window.scrollY === 0) {
      const distance = touch.clientY - (pullDistance || 0);
      if (distance > 0) {
        setPullDistance(Math.min(distance, 80));
      }
    }
  };

  const handlePullEnd = () => {
    if (pullDistance > 60) {
      setIsRefreshing(true);
      setTimeout(() => {
        const load = () => {
          const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
          setActiveAssets(active);
        };
        load();
        window.dispatchEvent(new Event('biasUpdated'));
        setIsRefreshing(false);
        setPullDistance(0);
      }, 600);
    } else {
      setPullDistance(0);
    }
  };

  const analyses = Object.values(activeAssets);

  if (analyses.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[80vh] text-center">
        <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center mb-4">
          <Crosshair className="w-10 h-10 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold mb-2">PrimeBias</h1>
        <p className="text-muted-foreground text-sm mb-6">Go to the Input tab to add assets for analysis</p>
        <Link to="/input">
          <Button className="rounded-full">Input</Button>
        </Link>
      </div>
    );
  }

  return (
    <div 
      className="p-4 space-y-4"
      onTouchMove={handlePullRefresh}
      onTouchEnd={handlePullEnd}
    >
      {pullDistance > 0 && (
        <div className="h-16 flex items-center justify-center overflow-hidden">
          <div className="text-center">
            <div className="inline-block">
              <div 
                className="w-10 h-10 rounded-full border-3 border-primary/20 border-t-primary transition-transform"
                style={{ 
                  transform: `rotate(${(pullDistance / 80) * 360}deg) scale(${Math.min(pullDistance / 40, 1)})`,
                  opacity: Math.min(pullDistance / 40, 1)
                }}
              />
            </div>
            {isRefreshing && <p className="text-xs text-muted-foreground mt-2">Refreshing...</p>}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight">PrimeBias</h1>
          <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="text-right text-sm space-y-1">
            <div className="text-muted-foreground">{analyses.length} assets</div>
            <div className="space-y-0.5">
              <div className="text-[10px] text-muted-foreground">time left in hour</div>
              <div className="text-xs bg-secondary rounded px-2 py-1 font-mono text-primary">
                {timeToNextHour ? `↻ ${timeToNextHour}` : '—'}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              localStorage.removeItem('primebias_active');
              setActiveAssets({});
              window.dispatchEvent(new Event('biasUpdated'));
              toast.success('Analyses cleared');
            }}
            className="h-9 w-9 text-destructive hover:text-destructive"
            title="Clear analyses"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
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
          <div className="space-y-4">
            {analyses.map(a => (
              <div key={a.instrument} className="rounded-lg border border-border bg-card p-4">
                <AnalysisCard analysis={a} />
              </div>
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
  const dirBg = mainDirection === 'BUY' ? 'bg-emerald-500/10 border-emerald-500/30' : mainDirection === 'SELL' ? 'bg-red-500/10 border-red-500/30' : 'bg-secondary border-border';

  const gradeColors = {
    A: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
    B: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
    C: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30',
    D: 'text-orange-400 bg-orange-500/15 border-orange-500/30',
    F: 'text-red-400 bg-red-500/15 border-red-500/30',
  };

  const actionColors = {
    TRADE: 'bg-emerald-500 text-white',
    WAIT: 'bg-yellow-500 text-black',
    NO_TRADE: 'bg-red-500 text-white',
  };

  return (
    <div className="space-y-3">
      {/* Instrument Header with Edit Button */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-foreground">
          {instrument}
        </div>
        <button
          onClick={() => {
            // Navigate to Input and set the selected instrument
            sessionStorage.setItem('selectedInstrument', instrument);
            window.location.pathname = '/input';
          }}
          className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          title="Edit values"
        >
          <Edit2 className="w-4 h-4" />
        </button>
      </div>

      {/* Main Direction Card */}
      <div className={cn('rounded-xl border-2 p-4 text-center', dirBg)}>
        <div className={cn('text-3xl font-bold', dirColor)}>{mainDirection}</div>
      </div>

      {/* Grade + Target + Action Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className={cn('rounded-lg border p-3 text-center', gradeColors[grade])}>
          <div className="text-3xl font-bold">{grade}</div>
          <div className="text-[10px] uppercase tracking-wider opacity-70">Grade</div>
        </div>
        <div className="rounded-lg border border-border bg-secondary p-3 text-center">
          <div className="text-2xl font-bold font-mono">{analysis.targetInfo?.target ? analysis.targetInfo.target.toFixed(4) : '—'}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Target</div>
        </div>
        <div className={cn('rounded-lg p-3 text-center flex flex-col items-center justify-center', actionColors[tradeAction])}>
          <div className="text-lg font-bold">{tradeAction}</div>
          <div className="text-[10px] uppercase tracking-wider opacity-80">Action</div>
        </div>
      </div>

      {/* Trend Breakdown */}
      <div className="grid grid-cols-3 gap-2">
        <TrendPill label="Deep" value={deepTrend} />
        <TrendPill label="DD" value={ddBias} />
        <TrendPill label="Now" value={nowBias} />
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1.5">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-2.5 text-xs text-yellow-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrendPill({ label, value }) {
  const color = value === 'BUY' || value === 'BULL' ? 'text-emerald-400' : value === 'SELL' || value === 'BEAR' ? 'text-red-400' : 'text-muted-foreground';
  return (
    <div className="rounded-lg bg-secondary/80 border border-border p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('text-sm font-bold', color)}>{value || '—'}</div>
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