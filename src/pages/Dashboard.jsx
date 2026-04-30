import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Trash2, SlidersHorizontal, CheckCircle2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { calculateBias } from '@/lib/biasEngine';
import { calcAlignment, alignmentColor } from '@/lib/alignmentUtils';
import { getSettings } from '@/lib/userSettings';
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
    mainDirection, grade, tradeAction, status,
    deepTrend, deepStrength, ddBias, ddStrength, nowBias, nowStrength, winningScore,
  } = results;

  const alignment = calcAlignment(results);
  const dirColor = mainDirection === 'BUY' ? 'text-emerald-600 dark:text-emerald-400'
    : mainDirection === 'SELL' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground';
  const dirBorder = mainDirection === 'BUY' ? 'border-emerald-500/40'
    : mainDirection === 'SELL' ? 'border-red-500/40' : 'border-border';

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4 space-y-3 cursor-pointer transition-all select-none',
        'hover:border-primary/40 active:scale-[0.98] active:bg-accent/50',
        pressed ? 'scale-[0.98] bg-accent/50' : '',
        dirBorder
      )}
      onClick={() => onOpen(analysis)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => { setPressed(false); }}
    >
      {/* Row 1: Name + Direction + Action + Chevron */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-bold text-sm">{instrument}</div>
          <div className={cn('text-2xl font-bold leading-tight', dirColor)}>{mainDirection}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end gap-1.5">
            <div className={cn('px-3 py-1 rounded-lg text-xs font-bold', actionColors[tradeAction])}>
              {tradeAction === 'NO_TRADE' ? 'NO TRADE' : tradeAction}
            </div>
            <div className={cn('text-xs font-semibold', gradeColors[grade])}>
              Grade {grade} <span className="text-muted-foreground font-normal">· {status}</span>
            </div>
          </div>
          {/* Chevron — always visible, signals tappability */}
          <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0 -mr-1" />
        </div>
      </div>

      {/* Row 2: Block breakdown */}
      {!compact && (
        <div className="flex gap-1.5">
          <TrendPill label="Deep" dir={deepTrend} strength={deepStrength} />
          <TrendPill label="DD" dir={ddBias} strength={ddStrength} />
          <TrendPill label="Now" dir={nowBias} strength={nowStrength} />
        </div>
      )}

      {/* Row 3: Metrics + Tap hint (mobile only) */}
      <div className="flex items-center gap-3 text-xs">
        {settings.showScore && (
          <span className="text-muted-foreground">
            Score <span className="text-foreground font-mono font-semibold">{winningScore}</span>
          </span>
        )}
        {settings.showTarget && targetInfo?.target && (
          <span className="text-muted-foreground">
            Target <span className="text-foreground font-mono font-semibold">{targetInfo.target.toFixed(4)}</span>
          </span>
        )}
        {settings.showAlignment && (
          <span className={cn('font-semibold', alignmentColor(alignment.label))}>
            {alignment.label}
          </span>
        )}
        {/* "Tap for details" — mobile only, fills remaining space */}
        <span className="ml-auto text-[10px] text-muted-foreground/50 md:hidden">
          Tap for details →
        </span>
      </div>

      {/* Why this trade */}
      {settings.showWhyThisTrade && !compact && (
        <div onClick={e => e.stopPropagation()}>
          <WhyThisTrade results={results} />
        </div>
      )}

      {/* Complete Trade */}
      <div onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onComplete(analysis)}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 py-2 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Complete Trade
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

function Crosshair(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="22" y1="12" x2="18" y2="12" />
      <line x1="6" y1="12" x2="2" y2="12" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeAssets, setActiveAssets] = useState({});
  const [timeToNextHour, setTimeToNextHour] = useState('');
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [completeAnalysis, setCompleteAnalysis] = useState(null);
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

  const handleEditInstrument = (instrument) => {
    setSelectedAnalysis(null);
    sessionStorage.setItem('selectedInstrument', instrument);
    navigate('/input');
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

  if (Object.values(activeAssets).length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[80vh] text-center">
        <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center mb-4">
          <Crosshair className="w-10 h-10 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold mb-2">PrimeBias</h1>
        <p className="text-muted-foreground text-sm mb-6">Go to the Bias Tool tab to add assets for analysis</p>
        <Button className="rounded-full" onClick={() => navigate('/input')}>Bias Tool</Button>
      </div>
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
              onComplete={setCompleteAnalysis}
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
          onCompleted={() => setCompleteAnalysis(null)}
        />
      )}
    </div>
  );
}