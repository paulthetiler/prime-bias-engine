import React, { useState, useEffect } from 'react';
import EngineBreakdown from '@/components/bias/EngineBreakdown';

export default function Engine() {
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    const load = () => {
      const stored = localStorage.getItem('primebias_current');
      if (stored) setAnalysis(JSON.parse(stored));
    };
    load();
    window.addEventListener('biasUpdated', load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener('biasUpdated', load);
      window.removeEventListener('storage', load);
    };
  }, []);

  if (!analysis?.results) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-muted-foreground text-sm">No analysis data yet. Go to Input to enter market data.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-lg font-bold tracking-tight">Bias Engine</h1>
        <span className="text-sm text-muted-foreground">{analysis.instrument || '—'}</span>
      </div>
      <p className="text-xs text-muted-foreground">How the score is built — timeframe-by-timeframe breakdown matching the Excel logic.</p>
      <EngineBreakdown results={analysis.results} />
    </div>
  );
}