import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { TIMEFRAMES, ASSETS, getDefaultInputs, calculateBias, getATRForAsset, calculateTarget } from '@/lib/biasEngine';
import TimeframeRow from '@/components/bias/TimeframeRow';
import BiasResult from '@/components/bias/BiasResult';
import ExtraCheck from '@/components/bias/ExtraCheck';
import AssetQuickSwitch from '@/components/bias/AssetQuickSwitch';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronDown, ChevronUp, Trash2, Check, ChevronsUpDown, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getSettings } from '@/lib/userSettings';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getActiveStore() {
  return JSON.parse(localStorage.getItem('primebias_active') || '{}');
}

function saveActiveStore(active) {
  localStorage.setItem('primebias_active', JSON.stringify(active));
}

/** Load saved inputs for an instrument, or return defaults. Never returns undefined. */
function loadInputsForInstrument(instrument) {
  if (!instrument) return getDefaultInputs();
  const active = getActiveStore();
  return active[instrument]?.inputs || getDefaultInputs();
}

function loadExtraCheckForInstrument(instrument) {
  if (!instrument) return { h1: null, m15: null };
  const active = getActiveStore();
  return active[instrument]?.extraCheck || { h1: null, m15: null };
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

  const [topAssets, setTopAssets] = useState(() => {
    const top = JSON.parse(localStorage.getItem('primebias_top_assets') || '[]');
    const extra = JSON.parse(localStorage.getItem('primebias_extra_assets') || '[]');
    return [...top, ...extra];
  });

  const autoSaveTimerRef = useRef(null);
  const isLoadingRef = useRef(false); // true while we are loading inputs for an instrument switch

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

  // ── Timer countdown ────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0);
      const diff = next - now;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Switch instrument — load saved state from localStorage ─────────────────
  function switchInstrument(newInstrument) {
    if (newInstrument === instrument) return;

    // Cancel any pending DB save
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
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

    const res = calculateBias(inputs, extraCheck);
    setResults(res);

    const atrValue = getATRForAsset(instrument, topAssets);
    setBaseAtr(atrValue);

    const targetData = calculateTarget(atrValue, res.grade, res.status);
    setTargetInfo(targetData);

    // ── Persist to localStorage immediately ──
    // Always write, regardless of whether this is a load or a user edit.
    // This ensures the active store is always up-to-date.
    const active = getActiveStore();
    active[instrument] = {
      instrument,
      inputs,
      extraCheck,
      results: res,
      timestamp: active[instrument]?.timestamp || new Date().toISOString(),
      atr: atrValue,
      targetInfo: targetData,
    };
    saveActiveStore(active);
    localStorage.setItem('primebias_instrument', instrument);
    setActiveAssets({ ...active });
    window.dispatchEvent(new Event('biasUpdated'));

    // ── DB auto-save: only on actual user edits, debounced 1.5 s ──
    if (!isLoadingRef.current) {
      setAutoSaveStatus('saving');
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(async () => {
        try {
          await base44.entities.BiasAnalysis.create({
            instrument,
            timestamp: new Date().toISOString(),
            inputs,
            results: res,
            overall_bias: res?.mainDirection || 'NEUTRAL',
            grade: res?.grade || 'F',
            confidence_score: res?.confidenceScore || 0,
            trade_action: res?.tradeAction || 'NO_TRADE',
            warnings: res?.warnings || [],
          });
          setAutoSaveStatus('saved');
          setTimeout(() => setAutoSaveStatus('idle'), 2000);
        } catch {
          setAutoSaveStatus('error');
          setTimeout(() => setAutoSaveStatus('idle'), 3000);
        }
      }, 1500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, extraCheck, instrument, topAssets]);

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
    localStorage.removeItem('primebias_instrument');
    setInstrument('');
    setInputs(getDefaultInputs());
    setExtraCheck({ h1: null, m15: null });
    setActiveAssets({});
    window.dispatchEvent(new Event('biasUpdated'));
    toast.success('Cleared all analyses');
  };

  const handleRemoveInstrument = () => {
    const active = getActiveStore();
    delete active[instrument];
    saveActiveStore(active);
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
    <div className="p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-base font-bold tracking-tight">Bias Tool</h1>
        <div className="flex items-center gap-2">
          <div className="bg-secondary rounded px-2 py-1 font-mono text-primary text-xs font-semibold">
            {timeToNextHour ? `↻ ${timeToNextHour}` : '—'}
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
              <>
                <AlertCircle className="w-3 h-3 text-destructive" />
                <span className="text-destructive font-semibold">Error</span>
              </>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleClearAll}
            className="h-8 w-8 text-destructive hover:text-destructive"
            title="Clear all data"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

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
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2 px-1">Broadstroke — Deep Trend</div>
          <div className="space-y-1.5">
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
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2 px-1">Trigger — Execution</div>
          <div className="space-y-1.5">
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
        <div className="grid grid-cols-2 gap-3 bg-accent/30 rounded-lg p-3 border border-border">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">ATR Used</div>
            <div className="text-lg font-mono font-bold text-foreground">{baseAtr ? baseAtr.toFixed(6) : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Target</div>
            <div className="text-lg font-mono font-bold text-foreground">
              {targetInfo?.target ? targetInfo.target.toFixed(6) : '—'}
              {targetInfo?.targetType && <span className="text-xs text-muted-foreground ml-1">({targetInfo.targetType})</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}