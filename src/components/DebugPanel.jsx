import React, { useState, useEffect } from 'react';
import { ChevronUp } from 'lucide-react';

export default function DebugPanel() {
  const [expanded, setExpanded] = useState(true);
  const [data, setData] = useState({
    active: {},
    locks: {},
  });

  useEffect(() => {
    const update = () => {
      const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
      const locks = JSON.parse(localStorage.getItem('primebias_completed_locks') || '{}');
      setData({ active, locks });
    };

    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, []);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-24 left-4 right-4 bg-yellow-400 text-black text-xs font-bold py-2 px-3 rounded-lg z-50"
      >
        🐛 DEBUG PANEL (expand)
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 bg-yellow-100 border-2 border-yellow-400 rounded-lg p-3 max-h-64 overflow-y-auto">
      <button
        onClick={() => setExpanded(false)}
        className="float-right text-yellow-700 hover:text-yellow-900"
      >
        <ChevronUp className="w-4 h-4" />
      </button>
      <div className="font-bold text-yellow-800 mb-2">🐛 DEBUG PANEL</div>

      <div className="text-xs space-y-2 text-yellow-900">
        <div>
          <div className="font-semibold">Active Instruments:</div>
          {Object.keys(data.active).length === 0 ? (
            <div className="text-yellow-700 ml-2">none</div>
          ) : (
            Object.entries(data.active).map(([inst, analysis]) => (
              <div key={inst} className="ml-2 font-mono">
                {inst}: {analysis?.analysisId || '?'}
              </div>
            ))
          )}
        </div>

        <div>
          <div className="font-semibold">Completed analysisIds:</div>
          {Object.keys(data.locks).length === 0 ? (
            <div className="text-yellow-700 ml-2">none</div>
          ) : (
            Object.keys(data.locks).map(id => (
              <div key={id} className="ml-2 font-mono text-yellow-700">
                {id}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}