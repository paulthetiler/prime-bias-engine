import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2 } from 'lucide-react';
import MarketIcon from './MarketIcon';

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
    <div className="relative">
      <div className="overflow-x-auto scrollbar-hide">
        <div
          ref={scrollContainerRef}
          className="flex gap-2 pt-0.5 pb-2 min-w-min"
        >
          {analyses.map(a => {
            const isActive = a.instrument === currentInstrument;
            const { results } = a;

            // Determine status indicators — an actionable setup: an aligned A–D
            // TRADE, or an Extra-Check-confirmed BUY/SELL on an Extended/F setup.
            const isTradeReady = ['TRADE', 'BUY', 'SELL'].includes(results?.tradeAction);
            const isIncomplete = !results || !results.mainDirection;

            return (
              <button
                key={a.instrument}
                data-active={isActive}
                onClick={() => onInstrumentChange(a.instrument)}
                className={cn(
                  'relative flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-[13px] border transition-all whitespace-nowrap shrink-0',
                  isActive
                    ? 'border-transparent bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_6px_16px_-6px_rgba(20,184,166,0.35)]'
                    : 'bg-card border-border/70 shadow-sm hover:border-primary/40'
                )}
              >
                {/* Monochrome supporting icon — inherits the pill's colour */}
                <span
                  className={cn(
                    'grid place-items-center w-[22px] h-[22px] rounded-[7px]',
                    isActive ? 'bg-white/20 text-white' : 'bg-foreground/[0.05] text-foreground/60'
                  )}
                >
                  <MarketIcon instrument={a.instrument} />
                </span>

                <span className="text-sm font-semibold">{a.instrument}</span>

                {/* Status indicators */}
                {isTradeReady && (
                  <CheckCircle2 className={cn('w-3.5 h-3.5', isActive ? 'text-white' : 'text-primary')} />
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

      {/* Subtle right-edge fade — hints there are more markets to scroll to */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}
