import React, { useState, useEffect } from 'react';

export default function CompletionDebugBanner() {
  const [data, setData] = useState({
    pathname: '',
    step: '',
    lastTrade: '',
    activeCount: 0,
  });

  useEffect(() => {
    const update = () => {
      const lastTrade = localStorage.getItem("primebias_last_completed_trade");
      const active = JSON.parse(localStorage.getItem("primebias_active") || '{}');
      const step = localStorage.getItem("PB_DEBUG_COMPLETION_STEP") || 'idle';

      setData({
        pathname: window.location.pathname,
        step,
        lastTrade: lastTrade ? JSON.parse(lastTrade)?.instrument || '?' : '—',
        activeCount: Object.keys(active).length,
      });
    };

    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-[99999] bg-red-500 text-white text-xs font-mono p-2 flex items-center justify-between gap-4 overflow-x-auto">
      <div className="flex gap-8 min-w-max">
        <div>
          <span className="font-bold">PATH:</span> {data.pathname}
        </div>
        <div>
          <span className="font-bold">STEP:</span> {data.step}
        </div>
        <div>
          <span className="font-bold">LAST TRADE:</span> {data.lastTrade}
        </div>
        <div>
          <span className="font-bold">ACTIVE COUNT:</span> {data.activeCount}
        </div>
      </div>
    </div>
  );
}