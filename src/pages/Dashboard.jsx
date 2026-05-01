import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Trash2, SlidersHorizontal, CheckCircle2, ChevronRight, Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { calculateBias } from '@/lib/biasEngine';
import { calcAlignment } from '@/lib/alignmentUtils';
import { getSettings } from '@/lib/userSettings';
import { getLocks } from '@/lib/tradeCompletion';
import AssetDetailModal from '@/components/bias/AssetDetailModal';
import WhyThisTrade from '@/components/bias/WhyThisTrade';
import CompleteTradeModal from '@/components/bias/CompleteTradeModal';



const gradeColors = {
  A: 'text-emerald-600 dark:text-emerald-400',
  B: 'text-blue-600 dark:text-blue-400',
  C: 'text-yellow-700 dark:text-yellow-400',
  D: 'text-orange-600 dark:text-orange-400',
  F: 'text-red-600 dark:text-red-400',
};

const actionColors = {
  TRADE: 'bg-emerald-500 text-white',
  WAIT: 'bg-yellow-500 text-black',
  NO_TRADE: 'bg-red-500 text-white',
};

function TrendPill({ label, dir, strength }) {
  const color = dir === 'BUY' || dir === 'BULL' ? 'text-emerald-600 dark:text-emerald-400'
    : dir === 'SELL' || dir === 'BEAR' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground';
  return (
    <div className="rounded-lg bg-secondary border border-border p-2 text-center flex-1 min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('text-xs font-bold truncate', color)}>{dir || '—'}</div>
      {strength && <div className="text-[9px] text-muted-foreground">{strength}</div>}
    </div>
  );
}

function AssetCard({ analysis, onOpen, onComplete, settings, compact }) {
  const { instrument, results, targetInfo } = analysis;
  const [pressed, setPressed] = useState(false);
  if (!results) return null;

  const {
    mainDirection, grade, gradeLabel, tradeAction, status,
    deepTrend, deepStrength, ddBias, ddStrength, nowBias, nowStrength,
  } = results;

  const dirColor = mainDirection === 'BUY' ? 'text-emerald-600 dark:text-emerald-400'
    : mainDirection === 'SELL' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground';
  const dirBorder = mainDirection === 'BUY' ? 'border-emerald-500/30'
    : mainDirection === 'SELL' ? 'border-red-500/30' : 'border-border';

  const statusBadge = status === 'Ready' || status === 'Scalp'
    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
    : status === 'Wait' || status === 'Weak'
    ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30'
    : 'bg-secondary text-muted-foreground border-border';

  const targetDisplay = targetInfo?.target ? targetInfo.target.toFixed(4) : '—';

  return (
    <div
      className={cn(
        'rounded-xl border bg-card cursor-pointer transition-all select-none overflow-hidden',
        'hover:border-primary/40 active:scale-[0.98] active:opacity-90',
        pressed ? 'scale-[0.98] opacity-90' : '',
        dirBorder
      )}
      onClick={() => onOpen(analysis)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
    >
      {/* Asset name + Direction row */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="font-bold text-sm tracking-tight text-foreground">{instrument}</span>
        <div className="flex items-center gap-2">
          <span className={cn('text-xl font-black tracking-tight', dirColor)}>{mainDirection}</span>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
        </div>
      </div>

      {/* Split layout */}
      <div className="flex min-h-[90px] border-t border-border/50">
        {/* Left — Grade */}
        <div className="flex flex-col items-center justify-center px-4 py-3 bg-secondary/50 border-r border-border/50 min-w-[72px]">
          <span className="text-3xl font-black tracking-tight text-foreground leading-none">{grade}</span>
          <span className="text-[10px] font-medium text-muted-foreground mt-1 text-center leading-tight">{gradeLabel}</span>
        </div>

        {/* Right — Decision info */}
        <div className="flex flex-col justify-center px-4 py-3 flex-1 gap-2">
          {/* Status badge */}
          <span className={cn('self-start text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', statusBadge)}>
            {status}
          </span>

          {/* Grid rows */}
          <div className="grid items-center gap-y-1.5" style={{ gridTemplateColumns: '1fr minmax(90px, auto)', columnGap: '12px' }}>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Direction</span>
            <span className={cn('text-sm font-bold', dirColor)}>{mainDirection}</span>

            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Action</span>
            <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded self-start w-fit', actionColors[tradeAction])}>
              {tradeAction === 'NO_TRADE' ? 'NO TRADE' : tradeAction}
            </span>

            {settings.showTarget && (
              <>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Target</span>
                <span className="text-xs font-mono font-semibold text-foreground">{targetDisplay}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Block breakdown */}
      {!compact && (
        <div className="flex gap-1.5 px-3 py-2.5 border-t border-border/40 bg-secondary/20">
          <TrendPill label="Deep" dir={deepTrend} strength={deepStrength} />
          <TrendPill label="DD" dir={ddBias} strength={ddStrength} />
          <TrendPill label="Now" dir={nowBias} strength={nowStrength} />
        </div>
      )}

      {/* Bottom bar — hint + complete */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border/40 bg-secondary/10">
        <span className="text-xs font-semibold text-primary" onClick={(e) => { e.stopPropagation(); onOpen(analysis); }}>View full details →</span>
        <button
          onClick={(e) => { e.stopPropagation(); onComplete(analysis); }}
          className="flex items-center gap-1 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
        >
          <CheckCircle2 className="w-3 h-3" />
          Complete
        </button>
      </div>
    </div>
  );
}

function FilterBar({ filters, onChange }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {[
        { key: 'filterABOnly', label: 'A/B Only' },
        { key: 'filterHideWait', label: 'Hide WAIT' },
        { key: 'filterHideExtended', label: 'Hide Extended' },
        { key: 'filterAlignedOnly', label: 'Aligned Only' },
      ].map(f => (
        <button
          key={f.key}
          onClick={() => onChange({ ...filters, [f.key]: !filters[f.key] })}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
            filters[f.key]
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-secondary text-muted-foreground border-border hover:border-primary/50'
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeAssets, setActiveAssets] = useState({});
  const [timeToNextHour, setTimeToNextHour] = useState('');
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [completeAnalysis, setCompleteAnalysis] = useState(null);
  const [lastCompletedTrade, setLastCompletedTrade] = useState(null);
  const [settings, setSettings] = useState(getSettings());
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(() => {
    const s = getSettings();
    return {
      filterABOnly: s.filterABOnly,
      filterHideWait: s.filterHideWait,
      filterHideExtended: s.filterHideExtended,
      filterAlignedOnly: s.filterAlignedOnly,
    };
  });

  useEffect(() => {
    const load = () => {
      const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
      Object.keys(active).forEach(key => {
        if (active[key]?.inputs) {
          active[key].results = calculateBias(active[key].inputs, active[key].extraCheck || null);
        }
      });
      setActiveAssets(active);

      // Close modal if the instrument is no longer active or is locked (completed)
      setCompleteAnalysis(prev => {
        if (!prev) return null;
        if (!(prev.instrument in active)) return null;
        return prev;
      });
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
    const onSettings = () => setSettings(getSettings());
    window.addEventListener('settingsUpdated', onSettings);
    return () => window.removeEventListener('settingsUpdated', onSettings);
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

  const handleOpenComplete = (analysis) => {
    const active = JSON.parse(localStorage.getItem("primebias_active") || "{}");
    const latest = active[analysis.instrument];

    const latestAnalysis = Array.isArray(latest)
      ? latest.find(a => a.analysisId === analysis.analysisId) || latest[0]
      : latest;

    console.log("PB_DEBUG_OPEN_COMPLETE_MODAL", {
      clickedInstrument: analysis.instrument,
      clickedAnalysisId: analysis.analysisId,
      latestAnalysisId: latestAnalysis?.analysisId,
    });

    setCompleteAnalysis(latestAnalysis || analysis);
  };

  const handleEditInstrument = (instrument) => {
    setSelectedAnalysis(null);
    sessionStorage.setItem('selectedInstrument', instrument);
    navigate('/input');
  };

  const handleTradeCompleted = (record) => {
    setCompleteAnalysis(null);
    setLastCompletedTrade(record);
    // Reload active assets to reflect the removed analysis
    const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
    Object.keys(active).forEach(key => {
      if (active[key]?.inputs) {
        active[key].results = calculateBias(active[key].inputs, active[key].extraCheck || null);
      }
    });
    setActiveAssets(active);
  };

  let analyses = Object.values(activeAssets);

  if (filters.filterABOnly) analyses = analyses.filter(a => ['A', 'B'].includes(a.results?.grade));
  if (filters.filterHideWait) analyses = analyses.filter(a => a.results?.tradeAction !== 'WAIT');
  if (filters.filterHideExtended) analyses = analyses.filter(a => !(a.results?.winningScore >= 90));
  if (filters.filterAlignedOnly) {
    analyses = analyses.filter(a => {
      const al = calcAlignment(a.results);
      return al.label === 'HIGH' || al.label === 'MEDIUM';
    });
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // Show trade completion success card if last trade was just completed
  if (Object.values(activeAssets).length === 0 && lastCompletedTrade) {
    return (
      <>
        <div className="p-4 space-y-4 pb-24">
          <div className="pt-8 flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-4 border border-emerald-500/30">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-lg font-bold mb-1">Trade Saved</h1>
            <p className="text-sm text-muted-foreground mb-6">
              {lastCompletedTrade.instrument} saved as <span className="font-semibold text-foreground">{lastCompletedTrade.result.toUpperCase()}</span>
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Button variant="default" className="rounded-full" onClick={() => navigate('/trade-history')}>
                View Trade History
              </Button>
              <Button variant="outline" className="rounded-full" onClick={() => navigate('/journal')}>
                Add Journal Note
              </Button>
              <Button variant="outline" className="rounded-full" onClick={() => navigate('/input')}>
                New Analysis
              </Button>
            </div>
          </div>
        </div>
        {completeAnalysis && (
          <CompleteTradeModal
            analysis={completeAnalysis}
            onClose={() => setCompleteAnalysis(null)}
            onCompleted={handleTradeCompleted}
          />
        )}
      </>
    );
  }

  // Show empty state only if no active trades and no recently completed trade
  if (Object.values(activeAssets).length === 0) {
    return (
      <>
        <div className="p-6 flex flex-col items-center justify-center min-h-[80vh] text-center">
          <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center mb-4">
            <Crosshair className="w-10 h-10 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold mb-2">No Active Analyses</h1>
          <p className="text-muted-foreground text-sm mb-6">Add new assets in the Bias Tool to continue.</p>
          <div className="flex gap-3">
            <Button variant="outline" className="rounded-full" onClick={() => navigate('/trade-history')}>Trade History</Button>
            <Button className="rounded-full" onClick={() => navigate('/input')}>Bias Tool</Button>
          </div>
        </div>
        {completeAnalysis && (
          <CompleteTradeModal
            analysis={completeAnalysis}
            onClose={() => setCompleteAnalysis(null)}
            onCompleted={handleTradeCompleted}
          />
        )}
      </>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Summary</h1>
          <p className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-secondary rounded px-2 py-1 font-mono text-primary text-xs font-semibold">
            ↻ {timeToNextHour}
          </div>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={cn(
              'relative p-2 rounded-lg border transition-colors',
              showFilters ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
          <Button
            variant="ghost" size="icon"
            onClick={() => {
              localStorage.removeItem('primebias_active');
              setActiveAssets({});
              window.dispatchEvent(new Event('biasUpdated'));
              toast.success('Analyses cleared');
            }}
            className="h-9 w-9 text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {showFilters && <FilterBar filters={filters} onChange={setFilters} />}

      {/* Stats */}
      <div className="flex gap-2 text-xs text-muted-foreground">
        <span>{analyses.length} assets</span>
        {activeFilterCount > 0 && <span className="text-primary">(filtered)</span>}
        <span className="ml-auto text-emerald-600 dark:text-emerald-400 font-semibold">
          {analyses.filter(a => a.results?.tradeAction === 'TRADE').length} TRADE
        </span>
        <span className="text-yellow-700 dark:text-yellow-400 font-semibold">
          {analyses.filter(a => a.results?.tradeAction === 'WAIT').length} WAIT
        </span>
      </div>

      {/* Cards */}
      {analyses.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No assets match the current filters
        </div>
      ) : (
        <div className="space-y-3">
          {analyses.map(a => (
            <AssetCard
              key={a.instrument}
              analysis={a}
              onOpen={setSelectedAnalysis}
              onComplete={handleOpenComplete}
              settings={settings}
              compact={settings.compactMode}
            />
          ))}
        </div>
      )}

      {selectedAnalysis && (
        <AssetDetailModal
          analysis={selectedAnalysis}
          settings={settings}
          onClose={() => setSelectedAnalysis(null)}
          onEdit={() => handleEditInstrument(selectedAnalysis.instrument)}
        />
      )}

      {completeAnalysis && (
        <CompleteTradeModal
          analysis={completeAnalysis}
          onClose={() => setCompleteAnalysis(null)}
          onCompleted={handleTradeCompleted}
        />
      )}
    </div>
  );
}