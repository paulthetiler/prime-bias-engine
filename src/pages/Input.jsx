import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { TIMEFRAMES, ASSETS, getDefaultInputs, calculateBias } from '@/lib/biasEngine';
import TimeframeRow from '@/components/bias/TimeframeRow';
import BiasResult from '@/components/bias/BiasResult';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

export default function Input() {
  const navigate = useNavigate();
  const [instrument, setInstrument] = useState('');
  const [inputs, setInputs] = useState(getDefaultInputs());
  const [results, setResults] = useState(null);
  const [showResult, setShowResult] = useState(true);
  const [saving, setSaving] = useState(false);

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
    
    // Store in active set
    const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
    active[instrument] = { instrument, inputs, results: res, timestamp: new Date().toISOString() };
    localStorage.setItem('primebias_active', JSON.stringify(active));
    window.dispatchEvent(new Event('biasUpdated'));
  }, [inputs, instrument]);

  const handleTFChange = (tfKey, indicators) => {
    setInputs(prev => ({ ...prev, [tfKey]: indicators }));
  };

  const handleReset = () => {
    setInputs(getDefaultInputs());
    setResults(null);
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
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={handleReset} className="h-9 w-9">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 h-9">
            <Save className="w-4 h-4" />
            Save
          </Button>
        </div>
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