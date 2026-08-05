import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TIMEFRAMES, ASSETS, getDefaultInputs, calculateBias, getATRForAsset, calculateTarget, formatAtrUsed, engineOptionsFromSettings } from '@/lib/biasEngine';
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
import { ChevronDown, ChevronUp, Trash2, Check, ChevronsUpDown, CheckCircle2, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
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

// ── Separate input storage (decoupled from active trades) ────────────────────
function getInputStore() {
  return JSON.parse(localStorage.getItem('primebias_inputs') || '{}');
}

function saveInputStore(inputs) {
  localStorage.setItem('primebias_inputs', JSON.stringify(inputs));
}

/** Load saved inputs for an instrument from input storage, or return defaults. */
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

// Turn a raw Supabase/PostgREST error into a short, actionable reason the user
// can read (and screenshot) on their phone. The two persistent causes worth
// naming explicitly are a not-yet-applied DB migration and an expired session.
function describeSaveError(err) {
  const code = err?.code || '';
  const msg = String(err?.message || err || 'Unknown error');
  // 42P10: no unique/exclusion constraint matching ON CONFLICT.
  // 42703: column does not exist. Both mean migration 0002 hasn't been applied.
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function Input() {
  const navigate = useNavigate();

  // Initialise instrument from localStorage immediately — no empty string default
  const [instrument, setInstrument] = useState(() => localStorage.getItem('primebias_instrument') || '');

  // Initialise inputs from localStorage immediately so we never flash defaults
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
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle'); // idle | saving | saved | error
  const [autoSaveError, setAutoSaveError] = useState(null); // human-readable reason a save failed
  const [confirmClear, setConfirmClear] = useState(false);

  const [topAssets, setTopAssets] = useState(() => {
    const top = JSON.parse(localStorage.getItem('primebias_top_assets') || '[]');
    const extra = JSON.parse(localStorage.getItem('primebias_extra_assets') || '[]');
    return [...top, ...extra];
  });

  const autoSaveTimerRef = useRef(null);
  const isLoadingRef = useRef(false); // true while we are loading inputs for an instrument switch
  const savedClearTimerRef = useRef(null); // clears the transient "Saved ✓" indicator
  // Holds the most recent auto-save payload when a save fails, so the user can retry it.
  const pendingSaveRef = useRef(null);
  // Monotonic "which save is current" token. A newer save (or an instrument
  // switch / clear-all) bumps it so an in-flight retry loop knows it's been
  // superseded and stops touching the status indicator.
  const saveGenRef = useRef(0);

  // ── Auto-save persistence ────────────────────────────────────────────────
  // Deterministic upsert keyed by (user_id, analysis_id): the DB decides whether
  // the row exists, so a failed attempt can be retried with the SAME payload and
  // never produces a duplicate. Transient failures are retried automatically with
  // backoff (see saveBiasAnalysisWithRetry) so a brief mobile drop-out self-heals;
  // only a persistent failure surfaces "Not saved" with a manual retry action.
  const runAutoSave = useCallback(async (payload) => {
    if (!payload) return;
    const gen = ++saveGenRef.current; // this call is now the current save
    if (savedClearTimerRef.current) clearTimeout(savedClearTimerRef.current);
    setAutoSaveStatus('saving');
    syncLog('save', `Saving analysis ${payload.analysis_id} (${payload.instrument}) to Supabase …`);
    try {
      await saveBiasAnalysisWithRetry(payload, {
        onRetry: (attempt, err) =>
          syncLog('save', `Transient save failure, retry #${attempt}.`, err?.message || err),
      });
      if (saveGenRef.current !== gen) return; // superseded by a newer save
      pendingSaveRef.current = null;
      setAutoSaveError(null);
      setAutoSaveStatus('saved');
      syncLog('save', `Saved ${payload.analysis_id} (${payload.instrument}) ✓`);
      savedClearTimerRef.current = setTimeout(() => {
        if (saveGenRef.current === gen) setAutoSaveStatus('idle');
      }, 2000);
    } catch (err) {
      if (saveGenRef.current !== gen) return; // superseded — don't clobber status
      syncError('save', `AutoSave failed after retries for ${payload.instrument}.`, err?.message || err);
      // Keep the payload so the user can retry the exact same upsert (no duplicate).
      pendingSaveRef.current = payload;
      setAutoSaveError(describeSaveError(err));
      setAutoSaveStatus('error');
    }
  }, []);

  const retryAutoSave = useCallback(() => {
    if (pendingSaveRef.current) runAutoSave(pendingSaveRef.current);
  }, [runAutoSave]);

  // ── Settings listener ──────────────────────────────────────────────────────
  useEffect(() => {
    const onSettings = () => setSettings(getSettings());
    window.addEventListener('settingsUpdated', onSettings);
    return () => window.removeEventListener('settingsUpdated', onSettings);
  }, []);

  // ── ATR listener ───────────────────────────────────────────────────────────
  useEffect(() => {
    const reload = () => {
      const top = JSON.parse(localStorage.getItem('primebias_top_assets') || '[]');
      const extra = JSON.parse(localStorage.getItem('primebias_extra_assets') || '[]');
      setTopAssets([...top, ...extra]);
    };
    window.addEventListener('atrUpdated', reload);
    return () => window.removeEventListener('atrUpdated', reload);
  }, []);

  // ── Reload active analyses on completion (from Dashboard/elsewhere) ───────
  useEffect(() => {
    const onBiasUpdated = () => {
      // Reload active assets (in case a trade was just completed)
      // But don't clear the current instrument — only refresh data if it still exists
      const active = getActiveStore();
      setActiveAssets({ ...active });
    };
    window.addEventListener('biasUpdated', onBiasUpdated);
    return () => window.removeEventListener('biasUpdated', onBiasUpdated);
  }, []);

  // ── Timer countdown ────────────────────────────────────────────────────────
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

  // ── Dashboard → Input navigation (sessionStorage) ─────────────────────────
  useEffect(() => {
    const sel = sessionStorage.getItem('selectedInstrument');
    if (sel) {
      sessionStorage.removeItem('selectedInstrument');
      // Only switch if different; switchInstrument handles loading
      if (sel !== instrument) switchInstrument(sel);
    }
     
  }, []);

  // ── Switch instrument — load saved state from localStorage ─────────────────
  function switchInstrument(newInstrument) {
    if (newInstrument === instrument) return;

    // Cancel any pending DB save (and supersede any in-flight retry loop)
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    saveGenRef.current++;
    setAutoSaveError(null);
    setAutoSaveStatus('idle');

    // Flag that we are loading (not a user edit)
    isLoadingRef.current = true;

    setInstrument(newInstrument);

    if (newInstrument) {
      localStorage.setItem('primebias_instrument', newInstrument);
      const loadedInputs = loadInputsForInstrument(newInstrument);
      const loadedExtra = loadExtraCheckForInstrument(newInstrument);
      // Set state synchronously so recalculate effect sees correct values
      setInputs(loadedInputs);
      setExtraCheck(loadedExtra);
    } else {
      localStorage.removeItem('primebias_instrument');
      setInputs(getDefaultInputs());
      setExtraCheck({ h1: null, m15: null });
    }

    // Unset loading flag after React has processed the state updates
    // (uses a microtask so it clears after the synchronous setState calls)
    Promise.resolve().then(() => { isLoadingRef.current = false; });
  }

  // ── Recalculate & persist on every input/instrument change ────────────────
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

    const targetData = calculateTarget(atrValue, res.grade);
    setTargetInfo(targetData);

    // ── Persist inputs to separate storage (decoupled from active trades) ──
    const inputStore = getInputStore();
    inputStore[instrument] = { inputs, extraCheck };
    saveInputStore(inputStore);
    localStorage.setItem('primebias_instrument', instrument);

    // ── Persist to active store (for dashboard display) ──
    // If the previous analysis for this instrument was already completed (its id is
    // locked), a genuine user edit must start a FRESH analysis — new id + timestamp —
    // so it reappears on the Summary. Otherwise it would inherit the completed lock and
    // stay hidden forever (e.g. change the engine later that day and it never shows).
    // A plain load/view (isLoadingRef) keeps the locked id, so completing a trade doesn't
    // pop back onto the Summary just from opening the Bias Tool.
    const active = getActiveStore();
    const { analysisId, isNew } = resolveAnalysisIdForEdit(
      active[instrument]?.analysisId,
      isLoadingRef.current,
      instrument,
    );
    active[instrument] = {
      instrument,
      analysisId,
      inputs,
      extraCheck,
      results: res,
      timestamp: isNew
        ? new Date().toISOString()
        : (active[instrument]?.timestamp || new Date().toISOString()),
      atr: atrValue,
      targetInfo: targetData,
    };
    saveActiveStore(active);
    setActiveAssets({ ...active });
    window.dispatchEvent(new Event('biasUpdated'));

    // ── DB auto-save: only on actual user edits, debounced 1.5 s ──
    if (!isLoadingRef.current) {
      // analysis_id makes this a deterministic upsert: one row per analysis session,
      // enforced by the DB (unique index on user_id, analysis_id — migration 0002).
      //
      // The payload is a COMPLETE snapshot (raw inputs + extra_check + results),
      // not just a summary, so another device can rebuild this exact Summary card
      // from the row. Without inputs there is nothing to hydrate (a card is
      // computed from inputs). extra_check/inputs columns require migration 0003.
      const payload = buildBiasAnalysisPayload({ analysisId, instrument, inputs, extraCheck, results: res });
      setAutoSaveStatus('saving');
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => { runAutoSave(payload); }, 1500);
    }
   
  }, [inputs, extraCheck, instrument, topAssets, settings, runAutoSave]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleTFChange = (tfKey, indicators) => {
    isLoadingRef.current = false; // definitely a user edit
    setInputs(prev => ({ ...prev, [tfKey]: indicators }));
  };

  const handleExtraCheckChange = (key, value) => {
    isLoadingRef.current = false;
    setExtraCheck(prev => ({ ...prev, [key]: value }));
  };

  const handleClearAll = () => {
    localStorage.removeItem('primebias_active');
    localStorage.removeItem('primebias_inputs');
    localStorage.removeItem('primebias_instrument');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    saveGenRef.current++; // supersede any in-flight retry loop
    pendingSaveRef.current = null;
    setAutoSaveError(null);
    setAutoSaveStatus('idle');
    setInstrument('');
    setInputs(getDefaultInputs());
    setExtraCheck({ h1: null, m15: null });
    setActiveAssets({});
    window.dispatchEvent(new Event('biasUpdated'));
    toast.success('Cleared all analyses');
    setConfirmClear(false);
  };

  const handleRemoveInstrument = () => {
    // Remove from active trades
    const active = getActiveStore();
    delete active[instrument];
    saveActiveStore(active);

    // Also remove from input storage if user wants a full reset
    const inputStore = getInputStore();
    delete inputStore[instrument];
    saveInputStore(inputStore);

    localStorage.removeItem('primebias_instrument');
    setActiveAssets({ ...active });
    window.dispatchEvent(new Event('biasUpdated'));
    toast.success('Removed from active');
    // Switch to another active instrument or clear
    const remaining = Object.keys(active);
    switchInstrument(remaining[0] || '');
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-base font-bold tracking-tight">Bias Tool</h1>
        <div className="flex items-center gap-2">
          <div className="bg-secondary rounded px-2 py-1 flex flex-col items-center leading-tight">
            <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-semibold">H1 Close</span>
            <span className="font-mono text-primary text-xs font-semibold">
              {timeToNextHour ? `↻ ${timeToNextHour}` : '—'}
            </span>
          </div>

          {/* Auto-save status */}
          <div className="h-8 px-2 rounded text-xs font-medium flex items-center gap-1 min-w-[70px]">
            {autoSaveStatus === 'saving' && (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Saving…</span>
              </>
            )}
            {autoSaveStatus === 'saved' && (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Saved ✓</span>
              </>
            )}
            {autoSaveStatus === 'error' && (
              <button
                type="button"
                onClick={retryAutoSave}
                className="flex items-center gap-1 text-destructive font-semibold hover:underline"
                aria-label="Retry saving. Your latest changes may not have synced."
              >
                <AlertCircle className="w-3 h-3" />
                <span>Not saved</span>
              </button>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmClear(true)}
            className="h-8 w-8 text-destructive hover:text-destructive"
            aria-label="Clear all data"
            title="Clear all data"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Save-failure banner — restrained, only shown when a sync fails, with retry. */}
      {autoSaveStatus === 'error' && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <div className="flex items-start gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span>Your latest changes may not have synced.</span>
              {autoSaveError && (
                <span className="block text-[11px] opacity-80 break-words">{autoSaveError}</span>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={retryAutoSave}
            className="h-7 gap-1.5 shrink-0 border-destructive/40 text-destructive hover:text-destructive"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retry
          </Button>
        </div>
      )}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all analyses?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears every saved instrument and its indicator inputs from the Bias Tool and
              Summary on this device. Your completed trades, journals and history are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick Asset Switcher */}
      {Object.values(activeAssets).length > 0 && (
        <div className="px-1">
          <AssetQuickSwitch
            analyses={Object.values(activeAssets)}
            currentInstrument={instrument}
            onInstrumentChange={switchInstrument}
          />
        </div>
      )}

      {/* Instrument Selector */}
      <div className="space-y-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="h-12 w-full justify-between text-base font-normal"
            >
              {instrument || 'Select instrument...'}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0" align="start">
            <Command>
              <CommandInput placeholder="Search instruments..." />
              <CommandEmpty>No instrument found.</CommandEmpty>
              <CommandList>
                <CommandGroup>
                  {ASSETS.map(asset => (
                    <CommandItem
                      key={asset}
                      value={asset}
                      onSelect={val => {
                        switchInstrument(val === instrument ? '' : val);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', instrument === asset ? 'opacity-100' : 'opacity-0')} />
                      {asset}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {instrument && (
          <Button variant="outline" size="sm" className="w-full" onClick={handleRemoveInstrument}>
            Remove {instrument}
          </Button>
        )}
      </div>

      {/* No instrument helper */}
      {!instrument && (
        <div className="text-xs text-orange-800 dark:text-amber-400 px-1 py-1.5 rounded-lg bg-orange-100 dark:bg-amber-500/10 border border-orange-300 dark:border-amber-500/20 text-center">
          Select an instrument above to start analysis
        </div>
      )}

      {/* Instructions */}
      {instrument && (
        <div className="text-xs text-muted-foreground px-1 space-y-0.5">
          {settings.inputStyle === 'tap-cycle'
            ? <span>Tap to cycle: <span className="text-muted-foreground font-mono">0</span> → <span className="text-emerald-700 dark:text-emerald-400 font-mono">+1</span> → <span className="text-red-700 dark:text-red-400 font-mono">−1</span> → <span className="text-muted-foreground font-mono">0</span></span>
            : <span>Tap <span className="text-emerald-700 dark:text-emerald-400 font-semibold">BUY</span> / <span className="text-muted-foreground font-semibold">NEUTRAL</span> / <span className="text-red-700 dark:text-red-400 font-semibold">SELL</span> for each indicator</span>
          }
          <div className="text-[10px] text-muted-foreground/70">When done → go to Summary → Complete trade → optionally journal it</div>
        </div>
      )}

      {/* Broadstroke Section */}
      {instrument && (
        <div>
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5 px-1">Broadstroke — Deep Trend</div>
          <div className="space-y-1">
            {TIMEFRAMES.filter(tf => tf.group === 'broadstroke').map(tf => (
              <TimeframeRow
                key={tf.key}
                tf={tf}
                indicators={inputs[tf.key]}
                onChange={handleTFChange}
                result={results?.timeframes?.[tf.key]}
                inputStyle={settings.inputStyle}
              />
            ))}
          </div>
        </div>
      )}

      {/* Trigger Section */}
      {instrument && (
        <div>
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5 px-1">Trigger — Execution</div>
          <div className="space-y-1">
            {TIMEFRAMES.filter(tf => tf.group === 'trigger').map(tf => (
              <TimeframeRow
                key={tf.key}
                tf={tf}
                indicators={inputs[tf.key]}
                onChange={handleTFChange}
                result={results?.timeframes?.[tf.key]}
                inputStyle={settings.inputStyle}
              />
            ))}
          </div>
        </div>
      )}

      {/* Extra Check */}
      {instrument && (
        <ExtraCheck
          h1={extraCheck.h1}
          m15={extraCheck.m15}
          onChange={handleExtraCheckChange}
        />
      )}

      {/* Results Toggle */}
      {instrument && (
        <>
          <button
            onClick={() => setShowResult(!showResult)}
            className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-secondary text-sm font-semibold"
          >
            <span>Bias Result</span>
            {showResult ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showResult && <BiasResult results={results} settings={settings} />}
        </>
      )}

      {/* ATR & Target */}
      {instrument && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-border">
            <div className="px-3 py-2.5">
              <div className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">ATR Used</div>
              <div className="text-base font-mono font-bold text-foreground">{formatAtrUsed(baseAtr, instrument) || '—'}</div>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">Target</div>
              <div className="text-base font-mono font-bold text-foreground">
                {targetInfo?.target ? targetInfo.target.toFixed(6) : '—'}
              </div>
              {targetInfo?.targetType && <div className="text-[9px] text-muted-foreground">{targetInfo.targetType}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}