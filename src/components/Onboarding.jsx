import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Crosshair, SlidersHorizontal, LayoutGrid, BookOpen, ChevronRight, ChevronLeft } from 'lucide-react';
import { tap } from '@/lib/haptics';

const KEY = 'primebias_onboarded';

const STEPS = [
  {
    icon: Crosshair,
    title: 'Welcome to PrimeBias',
    body: 'Grade any market in seconds. Read each timeframe, and the engine tells you the direction, a letter grade, and whether to trade, wait, or stand aside.',
  },
  {
    icon: SlidersHorizontal,
    title: '1 · Bias Tool',
    body: 'Pick an instrument, then tap each indicator (Close, MACD, RSI, Bollinger) per timeframe as BUY, NEUTRAL or SELL. Your result updates live as you go.',
  },
  {
    icon: LayoutGrid,
    title: '2 · Summary',
    body: 'Every instrument you analyse becomes a graded card here — direction, grade, action and block alignment. Filter for A/B setups or hide the WAITs.',
  },
  {
    icon: BookOpen,
    title: '3 · Complete & Journal',
    body: 'When a trade is done, tap Complete to log WIN / LOSS / BE. Then journal what happened — over time, Trade History shows if your A-grades really win more.',
  },
];

export default function Onboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(KEY)) setOpen(true);
    const onOpen = () => { setStep(0); setOpen(true); };
    window.addEventListener('openOnboarding', onOpen);
    return () => window.removeEventListener('openOnboarding', onOpen);
  }, []);

  const finish = () => {
    localStorage.setItem(KEY, '1');
    setOpen(false);
  };

  if (!open) return null;

  const s = STEPS[step];
  const Icon = s.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3">
      <div className="w-full max-w-sm bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
        {/* Skip */}
        <div className="flex justify-end p-2">
          <button onClick={finish} className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary transition-colors" aria-label="Skip">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-2 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto mb-4">
            <Icon className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-bold mb-2">{s.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed min-h-[88px]">{s.body}</p>
        </div>

        {/* Dots */}
        <div className="flex items-center justify-center gap-1.5 py-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? 'bg-primary w-5' : 'bg-secondary w-1.5'}`}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="flex gap-2 p-4 pt-1">
          {step > 0 ? (
            <Button variant="outline" className="flex-1 gap-1" onClick={() => { tap(); setStep(s => s - 1); }}>
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
          ) : (
            <Button variant="ghost" className="flex-1 text-muted-foreground" onClick={finish}>Skip</Button>
          )}
          <Button
            className="flex-1 gap-1"
            onClick={() => { tap(); isLast ? finish() : setStep(s => s + 1); }}
          >
            {isLast ? 'Get started' : 'Next'}
            {!isLast && <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
