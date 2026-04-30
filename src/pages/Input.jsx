import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { TIMEFRAMES, ASSETS, getDefaultInputs, calculateBias, getATRForAsset, calculateTarget } from '@/lib/biasEngine';
import TimeframeRow from '@/components/bias/TimeframeRow';
import BiasResult from '@/components/bias/BiasResult';
import ExtraCheck from '@/components/bias/ExtraCheck';
import AssetQuickSwitch from '@/components/bias/AssetQuickSwitch';
import { Button } from '@/components/ui/button';
import { Input as InputField } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronDown, ChevronUp, Trash2, Check, ChevronsUpDown, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import LiveResultBanner from '@/components/bias/LiveResultBanner';
import { getSettings } from '@/lib/userSettings';

export default function Input() {
  const navigate = useNavigate();
  const [instrument, setInstrument] = useState(() => localStorage.getItem('primebias_instrument') || '');
  const [inputs, setInputs] = useState(getDefaultInputs());
  const [results, setResults] = useState(null);
  const [showResult, setShowResult] = useState(true);

  const [baseAtr, setBaseAtr] = useState(null);
  const [targetInfo, setTargetInfo] = useState(null);
  const [timeToNextHour, setTimeToNextHour] = useState('');
  const [topAssets, setTopAssets] = useState([
    { asset: '', atr: null },
    { asset: '', atr: null },
    { asset: '', atr: null },
    { asset: '', atr: null },
    { asset: '', atr: null },
  ]);
  const [open, setOpen] = useState(false);
  const [extraCheck, setExtraCheck] = useState({ h1: null, m15: null });
  const [settings, setSettings] = useState(getSettings());

  useEffect(() => {
    const onSettings = () => setSettings(getSettings());
    window.addEventListener('settingsUpdated', onSettings);
    return () => window.removeEventListener('settingsUpdated', onSettings);
  }, []);
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle'); // idle, saving, saved
  const autoSaveTimeoutRef = useRef(null);
  const userEditedRef = useRef(false); // tracks if inputs changed due to user action vs loading

  const handleExtraCheckChange = (key, value) => {
    setExtraCheck(prev => {
      const updated = { ...prev, [key]: value };
      // Persist extraCheck with active analysis
      if (instrument) {
        const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
        if (active[instrument]) {
          active[instrument].extraCheck = updated;
          localStorage.setItem('primebias_active', JSON.stringify(active));
        }
      }
      return updated;
    });
  };

  // Timer countdown
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

  // Load top assets from ATR page (top 5 + extras combined)
  const loadAllAssets = () => {
    const top = JSON.parse(localStorage.getItem('primebias_top_assets') || '[]');
    const extra = JSON.parse(localStorage.getItem('primebias_extra_assets') || '[]');
    setTopAssets([...top, ...extra]);
  };

  useEffect(() => {
    loadAllAssets();
  }, []);

  // Listen for ATR changes
  useEffect(() => {
    window.addEventListener('atrUpdated', loadAllAssets);
    return () => window.removeEventListener('atrUpdated', loadAllAssets);
  }, []);

  // Load analysis from active set and sync active assets
  useEffect(() => {
    const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
    // Strip stale cached results — always recalculate fresh from inputs
    Object.keys(active).forEach(key => { delete active[key].results; });
    setActiveAssets(active);
    if (instrument && active[instrument]) {
      const data = active[instrument];
      const loadedInputs = data.inputs || getDefaultInputs();
      userEditedRef.current = false;
      setInputs(loadedInputs);
      const freshResults = calculateBias(loadedInputs, data.extraCheck || null);
      setResults(freshResults);
      setExtraCheck(data.extraCheck || { h1: null, m15: null });
    } else if (instrument) {
      userEditedRef.current = false;
      setInputs(getDefaultInputs());
      setExtraCheck({ h1: null, m15: null });
    }
  }, [instrument, topAssets]);

  // Track active assets for quick switch
  const [activeAssets, setActiveAssets] = useState({});

  // Load instrument from session storage if coming from Dashboard
  useEffect(() => {
    const selectedInstrument = sessionStorage.getItem('selectedInstrument');
    if (selectedInstrument) {
      setInstrument(selectedInstrument);
      sessionStorage.removeItem('selectedInstrument');
    }
  }, []);

  // Recalculate on every input change
  useEffect(() => {
    if (!instrument) return;
    const res = calculateBias(inputs, extraCheck);
    setResults(res);
    
    // Calculate ATR and target
    const atrValue = getATRForAsset(instrument, topAssets);
    setBaseAtr(atrValue);
    
    const targetData = calculateTarget(atrValue, res.grade, res.status);
    setTargetInfo(targetData);
    
    // Store in active set (preserve extraCheck)
    const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
    const prevExtraCheck = active[instrument]?.extraCheck || extraCheck;
    active[instrument] = { instrument, inputs, results: res, timestamp: new Date().toISOString(), atr: atrValue, targetInfo: targetData, extraCheck: prevExtraCheck };
    localStorage.setItem('primebias_active', JSON.stringify(active));
    localStorage.setItem('primebias_instrument', instrument);
    window.dispatchEvent(new Event('biasUpdated'));
    
    // Auto-save to database only on user edits, not on load
    if (userEditedRef.current) {
      setAutoSaveStatus('saving');
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = setTimeout(async () => {
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
      }, 1500);
    }
  }, [inputs, instrument, topAssets]);

  const handleTFChange = (tfKey, indicators) => {
    userEditedRef.current = true;
    setInputs(prev => ({ ...prev, [tfKey]: indicators }));
  };

  return (
    <div className="p-3 space-y-2.5">
      {/* Header — compact single row */}
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-base font-bold tracking-tight">Bias Tool</h1>
        <div className="flex items-center gap-2">
          <div className="bg-secondary rounded px-2 py-1 font-mono text-primary text-xs font-semibold">
            {timeToNextHour ? `↻ ${timeToNextHour}` : '—'}
          </div>
          {/* Auto-save status indicator */}
          <div className="h-8 px-2 rounded text-xs font-medium flex items-center gap-1 min-w-[64px]">
            {autoSaveStatus === 'saving' && (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Saving…</span>
              </>
            )}
            {autoSaveStatus === 'saved' && (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-600 dark:text-emerald-300 font-semibold">Saved ✓</span>
              </>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => {
              localStorage.removeItem('primebias_active');
              setInstrument('');
              setInputs(getDefaultInputs());
              window.dispatchEvent(new Event('biasUpdated'));
              toast.success('Cleared');
            }}
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
            onInstrumentChange={setInstrument}
          />
        </div>
      )}

      {/* Instrument Selector with Add/Remove */}
      <div className="space-y-2">
       <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
           <Button
             variant="outline"
             role="combobox"
             aria-expanded={open}
             className="h-12 w-full justify-between text-base font-normal"
           >
             {instrument || "Select instrument..."}
             <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
           </Button>
         </PopoverTrigger>
         <PopoverContent className="w-full p-0" align="start">
           <Command>
             <CommandInput placeholder="Search instruments..." />
             <CommandEmpty>No instrument found.</CommandEmpty>
             <CommandList>
               <CommandGroup>
                 {ASSETS.map((asset) => (
                   <CommandItem
                     key={asset}
                     value={asset}
                     onSelect={(currentValue) => {
                       setInstrument(currentValue === instrument ? "" : currentValue);
                       setOpen(false);
                     }}
                   >
                     <Check
                       className={cn(
                         "mr-2 h-4 w-4",
                         instrument === asset ? "opacity-100" : "opacity-0"
                       )}
                     />
                     {asset}
                   </CommandItem>
                 ))}
               </CommandGroup>
             </CommandList>
           </Command>
         </PopoverContent>
       </Popover>
        {instrument && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
                delete active[instrument];
                localStorage.setItem('primebias_active', JSON.stringify(active));
                localStorage.removeItem('primebias_instrument');
                setInstrument('');
                window.dispatchEvent(new Event('biasUpdated'));
                toast.success('Removed from active');
              }}
            >
              Remove
            </Button>
          </div>
        )}
      </div>

      {/* No instrument selected helper */}
      {!instrument && (
        <div className="text-xs text-orange-800 dark:text-amber-400 px-1 py-1.5 rounded-lg bg-orange-100 dark:bg-amber-500/10 border border-orange-300 dark:border-amber-500/20 text-center">
          Select an instrument above to start analysis
        </div>
      )}

      {/* Instructions */}
      <div className="text-xs text-muted-foreground px-1">
        Tap each indicator to cycle: <span className="text-muted-foreground">0</span> → <span className="text-emerald-700 dark:text-emerald-400">+1</span> → <span className="text-red-700 dark:text-red-400">−1</span> → <span className="text-muted-foreground">0</span>
      </div>

      {/* Live Result Banner */}
      {instrument && results && (
        <LiveResultBanner results={results} />
      )}

      {/* Broadstroke Section */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2 px-1">Broadstroke — Deep Trend</div>
        <div className="space-y-1.5">
          {TIMEFRAMES.filter(tf => tf.group === 'broadstroke').map(tf => (
            <TimeframeRow
              key={tf.key}
              tf={tf}
              indicators={inputs[tf.key]}
              onChange={handleTFChange}
              result={results?.timeframes[tf.key]}
              inputStyle={settings.inputStyle}
            />
          ))}
        </div>
      </div>

      {/* Trigger Section */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2 px-1">Trigger — Execution</div>
        <div className="space-y-1.5">
          {TIMEFRAMES.filter(tf => tf.group === 'trigger').map(tf => (
            <TimeframeRow
              key={tf.key}
              tf={tf}
              indicators={inputs[tf.key]}
              onChange={handleTFChange}
              result={results?.timeframes[tf.key]}
              inputStyle={settings.inputStyle}
            />
          ))}
        </div>
      </div>

      {/* Extra Check */}
      <ExtraCheck
        h1={extraCheck.h1}
        m15={extraCheck.m15}
        onChange={handleExtraCheckChange}
      />

      {/* Results Toggle */}
      <button
        onClick={() => setShowResult(!showResult)}
        className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-secondary text-sm font-semibold"
      >
        <span>Bias Result</span>
        {showResult ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {showResult && <BiasResult results={results} />}

      {/* ATR & Target — bottom */}
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