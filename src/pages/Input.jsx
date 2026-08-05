import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TIMEFRAMES, ASSETS, getDefaultInputs, calculateBias, getATRForAsset, calculateMinSafeMove, formatWithUnit, engineOptionsFromSettings } from '@/lib/biasEngine';
import TimeframeRow from '@/components/bias/TimeframeRow';
import BiasResult from '@/components/bias/BiasResult';
import ExtraCheck from '@/components/bias/ExtraCheck';
import AssetQuickSwitch from '@/components/bias/AssetQuickSwitch';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronDown, ChevronUp, Trash2, Check, CheckCircle2, Loader2, AlertCircle, RotateCcw, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getSettings } from '@/lib/userSettings';
import { resolveAnalysisIdForEdit } from '@/lib/tradeCompletion';
import { saveBiasAnalysisWithRetry, buildBiasAnalysisPayload } from '@/lib/autoSave';
import { syncLog, syncError } from '@/lib/syncLog';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getActiveStore() {
  return JSON.parse(localStorage.getItem('primebias_active') || '{}');
}

function saveActiveStore(active) {
  localStorage.setItem('primebias_active', JSON.stringify(active));
}

function getInputStore() {
  return JSON.parse(localStorage.getItem('primebias_inputs') || '{}');
}

function saveInputStore(inputs) {
  localStorage.setItem('primebias_inputs', JSON.stringify(inputs));
}

function loadInputsForInstrument(instrument) {
  if (!instrument) return getDefaultInputs();
  const inputs = getInputStore();
  return inputs[instrument]?.inputs || getDefaultInputs();
}

function loadExtraCheckForInstrument(instrument) {
  if (!instrument) return { h1: null, m15: null };
  const inputs = getInputStore();
  return inputs[instrument]?.extraCheck || { h1: null, m15: null };
}

function describeSaveError(err) {
  const code = err?.code || '';
  const msg = String(err?.message || err || 'Unknown error');
  if (code === '42P10' || code === '42703' || /on conflict|constraint|analysis_id|extra_check|column .* does not exist/i.test(msg)) {
    return 'Database not set up for auto-save (apply migrations 0002 and 0003).';
  }
  if (err?.status === 401 || /jwt|not authenticated|expired/i.test(msg)) {
    return 'Your session expired — sign out and back in.';
  }
  if (/failed to fetch|network|timeout/i.test(msg)) {
    return 'Network unavailable — will retry.';
  }
  return msg.slice(0, 140);
}

export default function Input() {
  const navigate = useNavigate();
  const [instrument, setInstrument] = useState(() => localStorage.getItem('primebias_instrument') || '');
  const [inputs, setInputs] = useState(() => loadInputsForInstrument(localStorage.getItem('primebias_instrument') || ''));
  const [extraCheck, setExtraCheck] = useState(() => loadExtraCheckForInstrument(localStorage.getItem('primebias_instrument') || ''));
  const [results, setResults] = useState(null);
  const [showResult, setShowResult] = useState(true);
  const [baseAtr, setBaseAtr] = useState(null);
  const [targetInfo, setTargetInfo] = useState(null);
  const [timeToNextHour, setTimeToNextHour] = useState('');
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(getSettings());
  const [activeAssets, setActiveAssets] = useState(() => getActiveStore());
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle');
  const [autoSaveError, setAutoSaveError] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const [topAssets, setTopAssets] = useState(() => {
    const top = JSON.parse(localStorage.getItem('primebias_top_assets') || '[]');
    const extra = JSON.parse(localStorage.getItem('primebias_extra_assets') || '[]');
    return [...top, ...extra];
  });

  const autoSaveTimerRef = useRef(null);
  const isLoadingRef = useRef(false);
  const savedClearTimerRef = useRef(null);
  const pendingSaveRef = useRef(null);
  const saveGenRef = useRef(0);

  const runAutoSave = useCallback(async (payload) => {
    if (!payload) return;
    const gen = ++saveGenRef.current;
    if (savedClearTimerRef.current) clearTimeout(savedClearTimerRef.current);
    setAutoSaveStatus('saving');
    syncLog('save', `Saving analysis ${payload.analysis_id} (${payload.instrument}) to Supabase …`);
    try {
      await saveBiasAnalysisWithRetry(payload, {
        onRetry: (attempt, err) => syncLog('save', `Transient save failure, retry #${attempt}.`, err?.message || err),
      });
      if (saveGenRef.current !== gen) return;
      pendingSaveRef.current = null;
      setAutoSaveError(null);
      setAutoSaveStatus('saved');
      syncLog('save', `Saved ${payload.analysis_id} (${payload.instrument}) ✓`);
      savedClearTimerRef.current = setTimeout(() => {
        if (saveGenRef.current === gen) setAutoSaveStatus('idle');
      }, 2000);
    } catch (err) {
      if (saveGenRef.current !== gen) return;
      syncError('save', `AutoSave failed after retries for ${payload.instrument}.`, err?.message || err);
      pendingSaveRef.current = payload;
      setAutoSaveError(describeSaveError(err));
      setAutoSaveStatus('error');
    }
  }, []);

  const retryAutoSave = useCallback(() => {
    if (pendingSaveRef.current) runAutoSave(pendingSaveRef.current);
  }, [runAutoSave]);

  useEffect(() => {
    const onSettings = () => setSettings(getSettings());
    window.addEventListener('settingsUpdated', onSettings);
    return () => window.removeEventListener('settingsUpdated', onSettings);
  }, []);

  useEffect(() => {
    const reload = () => {
      const top = JSON.parse(localStorage.getItem('primebias_top_assets') || '[]');
      const extra = JSON.parse(localStorage.getItem('primebias_extra_assets') || '[]');
      setTopAssets([...top, ...extra]);
    };
    window.addEventListener('atrUpdated', reload);
    return () => window.removeEventListener('atrUpdated', reload);
  }, []);

  useEffect(() => {
    const onBiasUpdated = () => setActiveAssets({ ...getActiveStore() });
    window.addEventListener('biasUpdated', onBiasUpdated);
    return () => window.removeEventListener('biasUpdated', onBiasUpdated);
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0);
      const diff = next.getTime() - now.getTime();
      setTimeToNextHour(`${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const sel = sessionStorage.getItem('selectedInstrument');
    if (sel) {
      sessionStorage.removeItem('selectedInstrument');
      if (sel !== instrument) switchInstrument(sel);
    }
  }, []);

  function switchInstrument(newInstrument) {
    if (newInstrument === instrument) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    saveGenRef.current++;
    setAutoSaveError(null);
    setAutoSaveStatus('idle');
    isLoadingRef.current = true;
    setInstrument(newInstrument);

    if (newInstrument) {
      localStorage.setItem('primebias_instrument', newInstrument);
      setInputs(loadInputsForInstrument(newInstrument));
      setExtraCheck(loadExtraCheckForInstrument(newInstrument));
    } else {
      localStorage.removeItem('primebias_instrument');
      setInputs(getDefaultInputs());
      setExtraCheck({ h1: null, m15: null });
    }

    Promise.resolve().then(() => { isLoadingRef.current = false; });
  }

  useEffect(() => {
    if (!instrument) {
      setResults(null);
      setBaseAtr(null);
      setTargetInfo(null);
      return;
    }

    const res = calculateBias(inputs, extraCheck, engineOptionsFromSettings(settings));
    setResults(res);
    const atrValue = getATRForAsset(instrument, topAssets);
    setBaseAtr(atrValue);
    const minSafeMove = calculateMinSafeMove(atrValue, res.grade);
    setTargetInfo(minSafeMove);

    const inputStore = getInputStore();
    inputStore[instrument] = { inputs, extraCheck };
    saveInputStore(inputStore);
    localStorage.setItem('primebias_instrument', instrument);

    const active = getActiveStore();
    const { analysisId, isNew } = resolveAnalysisIdForEdit(active[instrument]?.analysisId, isLoadingRef.current, instrument);
    active[instrument] = {
      instrument,
      analysisId,
      inputs,
      extraCheck,
      results: res,
      timestamp: isNew ? new Date().toISOString() : (active[instrument]?.timestamp || new Date().toISOString()),
      atr: atrValue,
      targetInfo: minSafeMove,
    };
    saveActiveStore(active);
    setActiveAssets({ ...active });
    window.dispatchEvent(new Event('biasUpdated'));

    if (!isLoadingRef.current) {
      const payload = buildBiasAnalysisPayload({ analysisId, instrument, inputs, extraCheck, results: res });
      setAutoSaveStatus('saving');
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => { runAutoSave(payload); }, 1500);
    }
  }, [inputs, extraCheck, instrument, topAssets, settings, runAutoSave]);

  const handleTFChange = (tfKey, indicators) => {
    isLoadingRef.current = false;
    setInputs(prev => ({ ...prev, [tfKey]: indicators }));
  };

  const handleExtraCheckChange = (key, value) => {
    isLoadingRef.current = false;
    setExtraCheck(prev => ({ ...prev, [key]: value }));
  };

  const handleRemoveInstrument = () => {
    const removed = instrument;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    saveGenRef.current++;
    pendingSaveRef.current = null;
    setAutoSaveError(null);
    setAutoSaveStatus('idle');

    const active = getActiveStore();
    delete active[removed];
    saveActiveStore(active);

    const inputStore = getInputStore();
    delete inputStore[removed];
    saveInputStore(inputStore);

    localStorage.removeItem('primebias_instrument');
    setActiveAssets({ ...active });
    window.dispatchEvent(new Event('biasUpdated'));
    toast.success(`Removed ${removed}`);
    setConfirmRemove(false);
    switchInstrument(Object.keys(active)[0] || '');
  };

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-base font-bold tracking-tight">Bias Tool</h1>
        <div className="flex items-center gap-2">
          <div className="bg-secondary rounded px-2 py-1 flex flex-col items-center leading-tight">
            <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-semibold">H1 Close</span>
            <span className="font-mono text-primary text-xs font-semibold">{timeToNextHour ? `↻ ${timeToNextHour}` : '—'}</span>
          </div>
          <div className="h-8 px-2 rounded text-xs font-medium flex items-center gap-1 min-w-[70px]">
            {autoSaveStatus === 'saving' && <><Loader2 className="w-3 h-3 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Saving…</span></>}
            {autoSaveStatus === 'saved' && <><CheckCircle2 className="w-3 h-3 text-emerald-500" /><span className="text-emerald-600 dark:text-emerald-400 font-semibold">Saved ✓</span></>}
            {autoSaveStatus === 'error' && (
              <button type="button" onClick={retryAutoSave} className="flex items-center gap-1 text-destructive font-semibold hover:underline" aria-label="Retry saving. Your latest changes may not have synced.">
                <AlertCircle className="w-3 h-3" /><span>Not saved</span>
              </button>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => setConfirmRemove(true)} disabled={!instrument} className="h-11 w-11 text-muted-foreground hover:text-destructive disabled:opacity-40" aria-label={instrument ? `Remove ${instrument}` : 'Remove instrument'} title={instrument ? `Remove ${instrument}` : 'Remove instrument'}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {autoSaveStatus === 'error' && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <div className="flex items-start gap-2 min-w-0"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><div className="min-w-0"><span>Your latest changes may not have synced.</span>{autoSaveError && <span className="block text-[11px] opacity-80 break-words">{autoSaveError}</span>}</div></div>
          <Button variant="outline" size="sm" onClick={retryAutoSave} className="h-7 gap-1.5 shrink-0 border-destructive/40 text-destructive hover:text-destructive"><RotateCcw className="w-3.5 h-3.5" /> Retry</Button>
        </div>
      )}

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {instrument}?</AlertDialogTitle>
            <AlertDialogDescription>This clears {instrument} and its indicator inputs from the Bias Tool and Summary on this device. Your completed trades, journals and history are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveInstrument} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {Object.values(activeAssets).length > 0 && (
        <div className="px-1">
          <AssetQuickSwitch analyses={Object.values(activeAssets)} currentInstrument={instrument} onInstrumentChange={switchInstrument} />
        </div>
      )}

      {!instrument && (
        <div className="text-xs text-orange-800 dark:text-amber-400 px-1 py-1.5 rounded-lg bg-orange-100 dark:bg-amber-500/10 border border-orange-300 dark:border-amber-500/20 text-center">
          Tap Add Instrument above to start analysis
        </div>
      )}

      {instrument && (
        <div className="text-xs text-muted-foreground px-1 space-y-0.5">
          {settings.inputStyle === 'tap-cycle'
            ? <span>Tap to cycle: <span className="text-muted-foreground font-mono">0</span> → <span className="text-emerald-700 dark:text-emerald-400 font-mono">+1</span> → <span className="text-red-700 dark:text-red-400 font-mono">−1</span> → <span className="text-muted-foreground font-mono">0</span></span>
            : <span>Tap <span className="text-emerald-700 dark:text-emerald-400 font-semibold">BUY</span> / <span className="text-muted-foreground font-semibold">NEUTRAL</span> / <span className="text-red-700 dark:text-red-400 font-semibold">SELL</span> for each indicator</span>}
          <div className="text-[10px] text-muted-foreground/70">When done → go to Summary → Complete trade → optionally journal it</div>
        </div>
      )}

      {instrument && TIMEFRAMES.map(tf => (
        <TimeframeRow key={tf.key} timeframe={tf} indicators={inputs[tf.key]} onChange={(indicators) => handleTFChange(tf.key, indicators)} inputStyle={settings.inputStyle} />
      ))}

      {instrument && (
        <ExtraCheck values={extraCheck} onChange={handleExtraCheckChange} />
      )}

      {instrument && results && (
        <>
          <button type="button" onClick={() => setShowResult(v => !v)} className="w-full flex items-center justify-between px-1 pt-1 text-xs font-semibold text-muted-foreground">
            <span>Bias result</span>{showResult ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showResult && <BiasResult results={results} instrument={instrument} atr={baseAtr} targetInfo={targetInfo} formattedAtr={formatWithUnit(baseAtr, instrument)} formattedTarget={formatWithUnit(targetInfo?.value, instrument)} />}
        </>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="fixed top-[78px] right-3 z-30 h-10 rounded-full border border-border/70 bg-background px-3 text-sm font-semibold shadow-sm flex items-center gap-1.5 hover:border-primary/40" aria-label="Add instrument">
            <Plus className="h-4 w-4" /> Add Instrument
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(320px,calc(100vw-24px))] p-0" align="end">
          <Command>
            <CommandInput placeholder="Search instruments..." />
            <CommandEmpty>No instrument found.</CommandEmpty>
            <CommandList>
              <CommandGroup>
                {ASSETS.map(asset => (
                  <CommandItem key={asset} value={asset} onSelect={val => { switchInstrument(val); setOpen(false); }}>
                    <Check className={cn('mr-2 h-4 w-4', instrument === asset ? 'opacity-100' : 'opacity-0')} />
                    {asset}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
