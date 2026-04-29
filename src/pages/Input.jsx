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

  // Load current analysis from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('primebias_current');
    if (stored) {
      const data = JSON.parse(stored);
      if (data.inputs) setInputs(data.inputs);
      if (data.instrument) setInstrument(data.instrument);
      if (data.results) setResults(data.results);
    }
  }, []);

  // Recalculate on every input change
  useEffect(() => {
    const res = calculateBias(inputs);
    setResults(res);
    
    // Store current state
    const current = { instrument, inputs, results: res, timestamp: new Date().toISOString() };
    localStorage.setItem('primebias_current', JSON.stringify(current));
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

      {/* Instrument Selector */}
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