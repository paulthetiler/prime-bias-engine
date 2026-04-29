import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import EngineBreakdown from '@/components/bias/EngineBreakdown';

export default function Engine() {
  const [analysis, setAnalysis] = useState(null);
  const [instruments, setInstruments] = useState([]);

  const [selected, setSelected] = useState(null);
  
  useEffect(() => {
    const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
    const instruments = Object.keys(active);
    if (instruments.length > 0 && !selected) setSelected(instruments[0]);
    if (selected && active[selected]) setAnalysis(active[selected]);
  }, [selected]);

  useEffect(() => {
    const load = () => {
      const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
      if (selected && active[selected]) setAnalysis(active[selected]);
    };
    window.addEventListener('biasUpdated', load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener('biasUpdated', load);
      window.removeEventListener('storage', load);
    };
  }, [selected]);

  useEffect(() => {
    const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
    setInstruments(Object.keys(active));
  }, []);

  if (!analysis?.results) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-muted-foreground text-sm">No analysis data yet. Go to Input to add assets.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-lg font-bold tracking-tight">Bias Engine</h1>
        <span className="text-sm text-muted-foreground">{analysis.instrument || '—'}</span>
      </div>
      {instruments.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {instruments.map(inst => (
            <Button
              key={inst}
              variant={selected === inst ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelected(inst)}
              className="shrink-0"
            >
              {inst}
            </Button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Timeframe-by-timeframe breakdown.</p>
      <EngineBreakdown results={analysis.results} />
    </div>
  );
}