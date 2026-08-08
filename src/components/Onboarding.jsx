import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { X, Crosshair, SlidersHorizontal, LayoutGrid, BookOpen, ChevronRight, ChevronLeft, Wallet } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { activeAccounts } from '@/lib/accounts';
import { tap } from '@/lib/haptics';
import { toast } from 'sonner';

const KEY = 'primebias_onboarded';
const CURRENCIES = ['USD', 'GBP', 'EUR', 'AUD', 'CAD', 'JPY', 'CHF', 'NZD', 'BTC', 'USDT'];

const GUIDE_STEPS = [
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
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [replay, setReplay] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [startingBalance, setStartingBalance] = useState('');

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['tradingAccounts'],
    queryFn: () => base44.entities.TradingAccount.list('created_at', 200),
    staleTime: 60_000,
  });
  const hasAccount = activeAccounts(accounts).length > 0;
  const firstRun = !localStorage.getItem(KEY);
  const steps = replay || hasAccount
    ? GUIDE_STEPS
    : [...GUIDE_STEPS, { icon: Wallet, title: '4 · Add your trading account', accountSetup: true }];

  const createAccount = useMutation({
    mutationFn: (data) => base44.entities.TradingAccount.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tradingAccounts'] });
      toast.success('Trading account added');
      finish();
    },
    onError: () => toast.error('Failed to create account'),
  });

  useEffect(() => {
    if (!isLoading && (firstRun || !hasAccount)) setOpen(true);
  }, [isLoading, firstRun, hasAccount]);

  useEffect(() => {
    const onOpen = () => { setReplay(true); setStep(0); setOpen(true); };
    window.addEventListener('openOnboarding', onOpen);
    return () => window.removeEventListener('openOnboarding', onOpen);
  }, []);

  const finish = () => {
    localStorage.setItem(KEY, '1');
    setReplay(false);
    setOpen(false);
  };

  const submitAccount = () => {
    const sb = parseFloat(startingBalance);
    createAccount.mutate({
      name: name.trim() || 'Personal',
      currency,
      starting_balance: Number.isFinite(sb) ? sb : 0,
      created_at: new Date().toISOString(),
    });
  };

  if (!open || isLoading) return null;

  const s = steps[Math.min(step, steps.length - 1)];
  const Icon = s.icon;
  const isLast = step === steps.length - 1;
  const accountStep = !!s.accountSetup;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3">
      <div className="w-full max-w-sm bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
        <div className="flex justify-end p-2">
          <button onClick={finish} className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary transition-colors" aria-label="Skip">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-2 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto mb-4">
            <Icon className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-bold mb-2">{s.title}</h2>
          {accountStep ? (
            <div className="text-left space-y-3">
              <p className="text-sm text-muted-foreground text-center leading-relaxed">
                Add the account you trade from so Prime Bias can track balance, realised P/L and performance properly.
              </p>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Account name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Personal"
                  className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}
                    className="w-full h-10 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Starting balance</label>
                  <input type="number" inputMode="decimal" step="any" value={startingBalance} onChange={e => setStartingBalance(e.target.value)} placeholder="0.00"
                    className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground text-center">You can add or manage more accounts later in Settings.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed min-h-[88px]">{s.body}</p>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 py-3">
          {steps.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'bg-primary w-5' : 'bg-secondary w-1.5'}`} />
          ))}
        </div>

        <div className="flex gap-2 p-4 pt-1">
          {step > 0 ? (
            <Button variant="outline" className="flex-1 gap-1" onClick={() => { tap(); setStep(v => v - 1); }}>
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
          ) : (
            <Button variant="ghost" className="flex-1 text-muted-foreground" onClick={finish}>Skip</Button>
          )}
          <Button
            className="flex-1 gap-1"
            disabled={accountStep && createAccount.isPending}
            onClick={() => { tap(); accountStep ? submitAccount() : isLast ? finish() : setStep(v => v + 1); }}
          >
            {accountStep ? (createAccount.isPending ? 'Adding…' : 'Add account') : isLast ? 'Get started' : 'Next'}
            {!accountStep && !isLast && <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
