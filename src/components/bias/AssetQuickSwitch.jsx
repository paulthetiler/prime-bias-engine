import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function AssetQuickSwitch({ analyses, currentInstrument, onInstrumentChange }) {
  const scrollContainerRef = useRef(null);

  // Auto-scroll to active tab
  useEffect(() => {
    const activeTab = scrollContainerRef.current?.querySelector('[data-active="true"]');
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentInstrument]);

  if (!analyses || analyses.length === 0) return null;

  return (
    <div className="overflow-x-auto scrollbar-hide">
      <div 
        ref={scrollContainerRef}
        className="flex gap-2 pb-2 min-w-min"
      >
        {analyses.map(a => {
          const isActive = a.instrument === currentInstrument;
          const { results } = a;
          
          // Determine status indicators
          const isTradeReady = results?.tradeAction === 'TRADE';
          const isIncomplete = !results || !results.mainDirection;
          
          return (
            <button
              key={a.instrument}
              data-active={isActive}
              onClick={() => onInstrumentChange(a.instrument)}
              className={cn(
                'relative flex items-center gap-2 px-3 py-2 rounded-lg border transition-all whitespace-nowrap shrink-0',
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border hover:border-border/80'
              )}
            >
              <span className="text-sm font-semibold">{a.instrument}</span>
              
              {/* Status indicators */}
              {isTradeReady && (
                <div className="flex items-center">
                  <CheckCircle2 className="w-3 h-3 text-primary" />
                </div>
              )}
              
              {isIncomplete && (
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  isActive ? 'bg-primary-foreground/50' : 'bg-yellow-400'
                )} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}