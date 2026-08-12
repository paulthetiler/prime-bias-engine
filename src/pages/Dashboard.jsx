import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Trash2, SlidersHorizontal, CheckCircle2, ChevronRight, Crosshair, BookOpen, Zap, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { calculateBias, engineOptionsFromSettings, formatWithUnit } from '@/lib/biasEngine';
import { calcAlignment } from '@/lib/alignmentUtils';
import { gradeText, blockBg, blockText, actionBadge, actionLabel } from '@/lib/gradeStyles';
import { getSettings } from '@/lib/userSettings';
import { orderAnalyses } from '@/lib/instrumentOrder';
import { isAnalysisLocked } from '@/lib/tradeCompletion';
import AssetDetailModal from '@/components/bias/AssetDetailModal';
import ExtendedCautionPill, { isExtendedCaution } from '@/components/bias/ExtendedCautionPill';
import CompleteTradeModal from '@/components/bias/CompleteTradeModal';
import TradeJournalFlow from '@/components/journal/TradeJournalFlow';
import { InstallBanner } from '@/components/InstallApp';
import { separationLabel } from '@/lib/strengthContext';

const STRENGTH_API_VERSION = '4';

function statusClass(status) {
  if (status === 'YES' || status === 'Scalp') return 'bg-primary/15 text-primary border-primary/30';
  if (status === 'Wait') return 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30';
  if (status === 'NO' || status === 'No') return 'bg-destructive/10 text-destructive border-destructive/25';
  return 'bg-secondary text-muted-foreground border-border';
}

function TrendPill({ label, dir, strength }) {
  return (
    <div className={cn('rounded-lg border p-2 text-center flex-1 min-w-0', blockBg(dir))}>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('text-xs font-bold truncate', blockText(dir))}>{dir || '—'}</div>
      {strength && <div className="text-[9px] text-muted-foreground">{strength}</div>}
    </div>
  );
}

function getSeparationBadge(instrument, snapshot) {
  if (!instrument?.includes('/') || !snapshot?.separations?.length) return null;
  const [base, quote] = instrument.split('/');
  const row = snapshot.separations.find(item => {
    const [a, b] = String(item.pair || '').split('/');
    return (a === base && b === quote) || (a === quote && b === base);
  });
  if (!row) return null;
  const maxSeparation = snapshot.separations[0]?.separation || 0;
  if (!maxSeparation) return null;
  const label = separationLabel(row.separation, maxSeparation);
  return label === 'VERY HIGH' || label === 'HIGH' ? { label, separation: row.separation } : null;
}

function instrumentCurrencies(instrument) {
  const clean = String(instrument || '').replace(/[^A-Z]/g, '');
  if (clean.length >= 6) return [clean.slice(0, 3), clean.slice(3, 6)];
  if (['US30', 'NAS100', 'SPX500'].includes(clean)) return ['USD'];
  return [];
}

function minutesUntil(dateValue) {
  const when = new Date(dateValue).getTime();
  if (!Number.isFinite(when)) return null;
  return Math.round((when - Date.now()) / 60000);
}

function formatCountdown(minutes) {
  if (minutes == null) return '';
  if (minutes < 0) return 'released';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function EconomicNewsStrip({ instrument, events }) {
  const currencies = instrumentCurrencies(instrument);
  if (!currencies.length || !events?.length) return null;
  const relevant = events
    .map(event => ({ ...event, minutes: minutesUntil(event.date) }))
    .filter(event => currencies.includes(event.country) && event.minutes != null && event.minutes >= -30)
    .filter(event => event.impact === 'High' || event.impact === 'Medium')
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, 2);
  if (!relevant.length) return null;
  return (
    <div className="border-t border-border/40 px-3 py-2.5 bg-background" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <CalendarDays className="w-3.5 h-3.5" /> Economic news
        </div>
        <span className="text-[9px] text-muted-foreground">Forex Factory</span>
      </div>
      <div className="space-y-1.5">
        {relevant.map(event => {
          const high = event.impact === 'High';
          const time = new Date(event.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          return (
            <div key={event.id} className={cn('flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[10px]', high ? 'border-destructive/20 bg-destructive/5' : 'border-yellow-500/20 bg-yellow-500/5')}>
              <span className={cn('w-2 h-2 rounded-full shrink-0', high ? 'bg-destructive' : 'bg-yellow-500')} />
              <span className="font-mono font-semibold text-foreground shrink-0">{time}</span>
              <span className="font-bold text-muted-foreground shrink-0">{event.country}</span>
              <span className="truncate text-foreground font-medium">{event.title}</span>
              <span className={cn('ml-auto shrink-0 font-bold', high ? 'text-destructive' : 'text-yellow-700 dark:text-yellow-400')}>{formatCountdown(event.minutes)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssetCard({ analysis, onOpen, onComplete, settings, compact, strengthSnapshot, newsEvents }) {
  const { instrument, results, targetInfo } = analysis;
  const [pressed, setPressed] = useState(false);
  if (!results) return null;
  const { mainDirection, grade, gradeLabel, tradeAction, status, readiness, deepTrend, deepStrength, ddBias, ddStrength, nowBias, nowStrength } = results;
  const dirColor = mainDirection === 'BUY' ? 'text-primary' : mainDirection === 'SELL' ? 'text-destructive' : 'text-muted-foreground';
  const dirBorder = mainDirection === 'BUY' ? 'border-primary/30' : mainDirection === 'SELL' ? 'border-destructive/30' : 'border-border';
  const minSafeMoveDisplay = formatWithUnit(targetInfo?.target, instrument) || '—';
  const separationBadge = getSeparationBadge(instrument, strengthSnapshot);
  return (
    <div className={cn('rounded-xl border bg-card cursor-pointer transition-all select-none overflow-hidden','hover:border-primary/40 active:scale-[0.98] active:opacity-90',pressed ? 'scale-[0.98] opacity-90' : '', dirBorder)} onClick={() => onOpen(analysis)} onTouchStart={() => setPressed(true)} onTouchEnd={() => setPressed(false)}>
      <div className="flex items-center justify-between px-4 pt-3 pb-2"><span className="font-bold text-sm tracking-tight text-foreground">{instrument}</span><div className="flex items-center gap-2"><span className={cn('text-xl font-black tracking-tight', dirColor)}>{mainDirection}</span><ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" /></div></div>
      <div className="flex min-h-[90px] border-t border-border/50"><div className="flex flex-col items-center justify-center px-4 py-3 bg-secondary/50 border-r border-border/50 min-w-[72px]"><span className={cn('text-3xl font-black tracking-tight leading-none', gradeText(grade))}>{grade}</span><span className="text-[10px] font-medium text-muted-foreground mt-1 text-center leading-tight">{gradeLabel}</span></div><div className="flex flex-col justify-center px-4 py-3 flex-1 gap-2"><div className="grid items-center gap-y-1.5" style={{ gridTemplateColumns: '1fr minmax(90px, auto)', columnGap: '12px' }}><span className="text-[10px] uppercase tracking-widest text-muted-foreground">Status</span><div className="flex items-center gap-1.5 flex-wrap min-w-0"><span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', statusClass(status))}>{status || '—'}</span>{isExtendedCaution(results) && <ExtendedCautionPill />}{separationBadge && <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" title={`Currency strength separation ${separationBadge.separation.toFixed(2)}%. Movement potential only — not direction.`}><Zap className="w-3 h-3" /> {separationBadge.label} SEP</span>}</div><span className="text-[10px] uppercase tracking-widest text-muted-foreground">Trade</span><span className={cn('text-xs font-bold px-1.5 py-0.5 rounded self-start w-fit', actionBadge(tradeAction))}>{actionLabel(tradeAction)}</span><span className="text-[10px] uppercase tracking-widest text-muted-foreground">Readiness</span><span className="text-xs font-semibold text-foreground">{readiness || '—'}</span>{settings.showTarget && <><span className="text-[10px] uppercase tracking-widest text-muted-foreground">Min Safe Move</span><span className="text-xs font-mono font-semibold text-foreground">{minSafeMoveDisplay}</span></>}</div></div></div>
      {!compact && <div className="flex gap-1.5 px-3 py-2.5 border-t border-border/40 bg-secondary/20"><TrendPill label="Deep" dir={deepTrend} strength={deepStrength} /><TrendPill label="DD" dir={ddBias} strength={ddStrength} /><TrendPill label="Now" dir={nowBias} strength={nowStrength} /></div>}
      <EconomicNewsStrip instrument={instrument} events={newsEvents} />
      <div className="flex items-center justify-between px-3 py-2 border-t border-border/40 bg-secondary/10"><span className="text-xs font-semibold text-primary" onClick={(e) => { e.stopPropagation(); onOpen(analysis); }}>View full details →</span><button onClick={(e) => { e.stopPropagation(); onComplete(analysis); }} className="flex items-center gap-1 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"><CheckCircle2 className="w-3 h-3" /> Complete</button></div>
    </div>
  );
}

function FilterBar({ filters, onChange }) {
  const items = [{ key: 'filterABOnly', label: 'A/B Only' },{ key: 'filterHideWait', label: 'Hide WAIT' },{ key: 'filterHideExtended', label: 'Hide Extended' },{ key: 'filterAlignedOnly', label: 'Aligned Only' }];
  return <div className="flex gap-2 flex-wrap">{items.map(f => <button key={f.key} onClick={() => onChange({ ...filters, [f.key]: !filters[f.key] })} className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',filters[f.key] ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-muted-foreground border-border hover:border-primary/50')}>{f.label}</button>)}</div>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeAssets, setActiveAssets] = useState({});
  const [timeToNextHour, setTimeToNextHour] = useState('');
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [completeAnalysis, setCompleteAnalysis] = useState(null);
  const [lastCompletedTrade, setLastCompletedTrade] = useState(null);
  const [journalTrade, setJournalTrade] = useState(null);
  const [journalPrompt, setJournalPrompt] = useState(null);
  const [settings, setSettings] = useState(getSettings());
  const [showFilters, setShowFilters] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [strengthData, setStrengthData] = useState(null);
  const [newsEvents, setNewsEvents] = useState([]);
  const [filters, setFilters] = useState(() => { const s = getSettings(); return { filterABOnly: s.filterABOnly, filterHideWait: s.filterHideWait, filterHideExtended: s.filterHideExtended, filterAlignedOnly: s.filterAlignedOnly }; });
  useEffect(() => { const load = () => { const opts = engineOptionsFromSettings(getSettings()); const active = JSON.parse(localStorage.getItem('primebias_active') || '{}'); Object.keys(active).forEach(key => { if (active[key]?.inputs) active[key].results = calculateBias(active[key].inputs, active[key].extraCheck || null, opts); }); setActiveAssets(active); setCompleteAnalysis(prev => (!prev || !(prev.instrument in active)) ? null : prev); }; load(); ['biasUpdated', 'storage', 'settingsUpdated', 'instrumentOrderUpdated'].forEach(e => window.addEventListener(e, load)); return () => ['biasUpdated', 'storage', 'settingsUpdated', 'instrumentOrderUpdated'].forEach(e => window.removeEventListener(e, load)); }, []);
  useEffect(() => { const loadStrength = async () => { try { const response = await fetch(`/api/currency-strength?v=${STRENGTH_API_VERSION}`); if (response.ok) setStrengthData(await response.json()); } catch {} }; loadStrength(); const interval = setInterval(loadStrength, 15 * 60 * 1000); return () => clearInterval(interval); }, []);
  useEffect(() => { const loadNews = async () => { try { const response = await fetch('/api/economic-calendar'); if (response.ok) { const payload = await response.json(); setNewsEvents(Array.isArray(payload.events) ? payload.events : []); } } catch {} }; loadNews(); const interval = setInterval(loadNews, 5 * 60 * 1000); return () => clearInterval(interval); }, []);
  useEffect(() => { const onSettings = () => setSettings(getSettings()); window.addEventListener('settingsUpdated', onSettings); return () => window.removeEventListener('settingsUpdated', onSettings); }, []);
  useEffect(() => { const updateCountdown = () => { const now = new Date(); const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0); const diff = nextHour.getTime() - now.getTime(); setTimeToNextHour(`${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`); }; updateCountdown(); const interval = setInterval(updateCountdown, 1000); return () => clearInterval(interval); }, []);
  const handleOpenComplete = (analysis) => { const active = JSON.parse(localStorage.getItem('primebias_active') || '{}'); const latest = active[analysis.instrument]; const latestAnalysis = Array.isArray(latest) ? latest.find(a => a.analysisId === analysis.analysisId) || latest[0] : latest; setCompleteAnalysis(latestAnalysis || analysis); };
  const handleEditInstrument = (instrument) => { setSelectedAnalysis(null); sessionStorage.setItem('selectedInstrument', instrument); navigate('/input'); };
  const handleTradeCompleted = (record) => { setCompleteAnalysis(null); setLastCompletedTrade(record); setJournalPrompt(record); const opts = engineOptionsFromSettings(getSettings()); const active = JSON.parse(localStorage.getItem('primebias_active') || '{}'); Object.keys(active).forEach(key => { if (active[key]?.inputs) active[key].results = calculateBias(active[key].inputs, active[key].extraCheck || null, opts); }); setActiveAssets(active); };
  const journalModals = <>{journalPrompt && <div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setJournalPrompt(null)}><div className="w-full max-w-sm bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl p-5 text-center space-y-4" style={{ marginBottom: 'calc(64px + var(--safe-area-bottom))' }} onClick={e => e.stopPropagation()}><div className="w-12 h-12 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto"><BookOpen className="w-6 h-6 text-primary" /></div><div><div className="text-base font-bold">Journal this trade?</div><div className="text-sm text-muted-foreground mt-1">{journalPrompt.instrument} saved. Capture what happened while it's fresh.</div></div><div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setJournalPrompt(null)}>Skip</Button><Button className="flex-1 gap-1.5" onClick={() => { setJournalTrade(journalPrompt); setJournalPrompt(null); }}><BookOpen className="w-4 h-4" /> Journal</Button></div></div></div>}{journalTrade && <TradeJournalFlow trade={journalTrade} onClose={() => setJournalTrade(null)} onDone={() => setJournalTrade(null)} />}</>;
  let analyses = orderAnalyses(Object.values(activeAssets).filter(a => !isAnalysisLocked(a.analysisId)));
  if (filters.filterABOnly) analyses = analyses.filter(a => ['A', 'B'].includes(a.results?.grade));
  if (filters.filterHideWait) analyses = analyses.filter(a => a.results?.status !== 'Wait');
  if (filters.filterHideExtended) analyses = analyses.filter(a => a.results?.status !== 'Extended');
  if (filters.filterAlignedOnly) analyses = analyses.filter(a => ['HIGH', 'MEDIUM'].includes(calcAlignment(a.results).label));
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const waitCount = analyses.filter(a => a.results?.status === 'Wait').length;
  const directionalCount = analyses.filter(a => ['BUY', 'SELL'].includes(a.results?.tradeAction)).length;
  if (Object.values(activeAssets).length === 0 && lastCompletedTrade) return <>{journalModals}<div className="p-4 space-y-4 pb-24"><div className="pt-8 flex flex-col items-center justify-center min-h-[60vh] text-center"><CheckCircle2 className="w-10 h-10 text-emerald-500 mb-4" /><h1 className="text-lg font-bold mb-1">Trade Saved</h1><p className="text-sm text-muted-foreground mb-6">{lastCompletedTrade.instrument} saved as <span className="font-semibold text-foreground">{lastCompletedTrade.result.toUpperCase()}</span></p><div className="flex flex-col gap-2 w-full max-w-xs"><Button onClick={() => navigate('/trade-history')}>View Trade History</Button><Button variant="outline" onClick={() => navigate('/input')}>New Analysis</Button></div></div></div></>;
  if (Object.values(activeAssets).length === 0) return <><div className="p-6 flex flex-col items-center justify-center min-h-[80vh] text-center"><div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center mb-4"><Crosshair className="w-10 h-10 text-muted-foreground" /></div><h1 className="text-xl font-bold mb-2">No Active Analyses</h1><p className="text-muted-foreground text-sm mb-6">Add new assets in the Bias Tool to continue.</p><Button className="rounded-full" onClick={() => navigate('/input')}>Bias Tool</Button></div>{journalModals}</>;
  return <div className="p-4 space-y-4 pb-24"><div className="flex items-center justify-between pt-2"><div><h1 className="text-lg font-bold tracking-tight">Summary</h1><p className="text-xs text-muted-foreground">{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</p></div><div className="flex items-center gap-2"><div className="bg-secondary rounded px-2 py-1 font-mono text-primary text-xs font-semibold">↻ {timeToNextHour}</div><button onClick={() => setShowFilters(f => !f)} className={cn('relative p-2 rounded-lg border transition-colors', showFilters ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50')}><SlidersHorizontal className="w-4 h-4" />{activeFilterCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">{activeFilterCount}</span>}</button><Button variant="ghost" size="icon" onClick={() => setConfirmClear(true)} aria-label="Clear all analyses" className="h-9 w-9 text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button></div></div><InstallBanner />{showFilters && <FilterBar filters={filters} onChange={setFilters} />}<div className="flex gap-2 text-xs text-muted-foreground"><span>{analyses.length} assets</span>{activeFilterCount > 0 && <span className="text-primary">(filtered)</span>}<span className="ml-auto font-semibold">{directionalCount} directional</span><span className="text-yellow-700 dark:text-yellow-400 font-semibold">{waitCount} WAIT</span></div>{analyses.length === 0 ? <div className="text-center py-12 text-muted-foreground text-sm">No assets match the current filters</div> : <div className="space-y-3">{analyses.map(a => <AssetCard key={a.instrument} analysis={a} onOpen={setSelectedAnalysis} onComplete={handleOpenComplete} settings={settings} compact={settings.compactMode} strengthSnapshot={strengthData?.windows?.today} newsEvents={newsEvents} />)}</div>}{selectedAnalysis && <AssetDetailModal analysis={selectedAnalysis} settings={settings} strengthData={strengthData} onClose={() => setSelectedAnalysis(null)} onEdit={() => handleEditInstrument(selectedAnalysis.instrument)} />}{completeAnalysis && <CompleteTradeModal analysis={completeAnalysis} onClose={() => setCompleteAnalysis(null)} onCompleted={handleTradeCompleted} />}{journalModals}<AlertDialog open={confirmClear} onOpenChange={setConfirmClear}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Clear all analyses?</AlertDialogTitle><AlertDialogDescription>This removes every active analysis from the Summary on this device. Your completed trades, journals and history are not affected.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { localStorage.removeItem('primebias_active'); setActiveAssets({}); window.dispatchEvent(new Event('biasUpdated')); toast.success('Analyses cleared'); setConfirmClear(false); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Clear all</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>;
}
