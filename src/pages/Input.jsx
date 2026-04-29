import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { TIMEFRAMES, ASSETS, getDefaultInputs, calculateBias, getATRForAsset, calculateTarget } from '@/lib/biasEngine';
import TimeframeRow from '@/components/bias/TimeframeRow';
import BiasResult from '@/components/bias/BiasResult';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input as InputField } from '@/components/ui/input';
import { Save, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

export default function Input() {
  const navigate = useNavigate();
  const [instrument, setInstrument] = useState('');
  const [inputs, setInputs] = useState(getDefaultInputs());
  const [results, setResults] = useState(null);
  const [showResult, setShowResult] = useState(true);
  const [saving, setSaving] = useState(false);
  const [baseAtr, setBaseAtr] = useState(null);
  const [targetInfo, setTargetInfo] = useState(null);
  const [topAssets, setTopAssets] = useState([
    { asset: '', atr: null },
    { asset: '', atr: null },
    { asset: '', atr: null },
    { asset: '', atr: null },
    { asset: '', atr: null },
  ]);

  // Load top assets from ATR page
  useEffect(() => {
    const saved = localStorage.getItem('primebias_top_assets');
    if (saved) {
      setTopAssets(JSON.parse(saved));
    }
  }, []);

  // Listen for ATR changes
  useEffect(() => {
    const handleAtrUpdate = () => {
      const saved = localStorage.getItem('primebias_top_assets');
      if (saved) {
        setTopAssets(JSON.parse(saved));
      }
    };
    window.addEventListener('atrUpdated', handleAtrUpdate);
    return () => window.removeEventListener('atrUpdated', handleAtrUpdate);
  }, []);

  // Load analysis from active set
  useEffect(() => {
    const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
    if (instrument && active[instrument]) {
      const data = active[instrument];
      setInputs(data.inputs || getDefaultInputs());
      setResults(data.results || null);
    }
  }, [instrument]);

  // Recalculate on every input change
  useEffect(() => {
    if (!instrument) return;
    const res = calculateBias(inputs);
    setResults(res);
    
    // Calculate ATR and target
    const atrValue = getATRForAsset(instrument, topAssets);
    setBaseAtr(atrValue);
    
    const targetData = calculateTarget(atrValue, res.grade, res.status);
    setTargetInfo(targetData);
    
    // Store in active set
    const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
    active[instrument] = { instrument, inputs, results: res, timestamp: new Date().toISOString(), atr: atrValue, targetInfo: targetData };
    localStorage.setItem('primebias_active', JSON.stringify(active));
    window.dispatchEvent(new Event('biasUpdated'));
  }, [inputs, instrument, topAssets]);

  const handleTFChange = (tfKey, indicators) => {
    setInputs(prev => ({ ...prev, [tfKey]: indicators }));
  };

  const handleReset = () => {
    setInputs(getDefaultInputs());
  };

  const handleSave = async () => {
    if (!instrument) {
      toast.error('Please select an instrument first');
      return;
    }
    setSaving(true);
    await base44.entities.BiasAnalysis.create({
      instrument,
      timestamp: new Date().toISOString(),
      inputs,
      results,
      overall_bias: results?.mainDirection || 'NEUTRAL',
      grade: results?.grade || 'F',
      confidence_score: results?.confidenceScore || 0,
      trade_action: results?.tradeAction || 'NO_TRADE',
      warnings: results?.warnings || [],
    });
    toast.success('Analysis saved to history');
    setSaving(false);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-lg font-bold tracking-tight">Market Input</h1>
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 h-9">
          <Save className="w-4 h-4" />
          Save
        </Button>
      </div>

      {/* Instrument Selector with Add/Remove */}
      <div className="space-y-2">
        <Select value={instrument} onValueChange={setInstrument}>
          <SelectTrigger className="h-12 text-base">
            <SelectValue placeholder="Select instrument..." />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {ASSETS.map(a => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      {/* Live ATR & Target Display */}
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

      {/* Instructions */}
      <div className="text-xs text-muted-foreground px-1">
        Tap each indicator to cycle: <span className="text-muted-foreground">0</span> → <span className="text-emerald-400">+1</span> → <span className="text-red-400">−1</span> → <span className="text-muted-foreground">0</span>
      </div>

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
            />
          ))}
        </div>
      </div>

      {/* Results Toggle */}
      <button
        onClick={() => setShowResult(!showResult)}
        className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-secondary text-sm font-semibold"
      >
        <span>Bias Result</span>
        {showResult ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {showResult && <BiasResult results={results} />}
    </div>
  );
}