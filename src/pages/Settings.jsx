import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/lib/useTheme';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Moon, Sun, BookOpen, ChevronDown, ChevronUp, RotateCcw, History, Sparkles, LogOut } from 'lucide-react';
import HowToGuide from '@/components/HowToGuide';
import { InstallCard } from '@/components/InstallApp';
import ExportBackup from '@/components/ExportBackup';
import ImportBackup from '@/components/ImportBackup';
import AccountsManager from '@/components/accounts/AccountsManager';
import { getSettings, saveSettings, DEFAULTS } from '@/lib/userSettings';
import { cn } from '@/lib/utils';

function SectionHeader({ title, sub, open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-3 text-left"
    >
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
    </button>
  );
}

/** @param {{ label: any, sub?: any, value: any, onChange: (v: boolean) => void }} props */
function Toggle({ label, sub, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex-1 pr-4">
        <div className="text-sm text-foreground">{label}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          'relative w-11 h-6 rounded-full transition-colors shrink-0',
          value ? 'bg-primary' : 'bg-secondary border border-border'
        )}
      >
        <div className={cn(
          'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
          value ? 'translate-x-5' : 'translate-x-0.5'
        )} />
      </button>
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [showGuide, setShowGuide] = useState(false);
  const [s, setS] = useState(getSettings());
  const [openSections, setOpenSections] = useState({
    display: true, input: false, completion: false, filters: false
  });

  const toggle = (key) => setOpenSections(o => ({ ...o, [key]: !o[key] }));
  const update = (key, value) => {
    const next = { ...s, [key]: value };
    setS(next);
    saveSettings(next);
  };
  const resetAll = () => {
    const fresh = { ...DEFAULTS };
    setS(fresh);
    saveSettings(fresh);
  };

  return (
    <div className="p-4 space-y-2 pb-24">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-lg font-bold tracking-tight">Settings</h1>
        <Button variant="ghost" size="sm" onClick={resetAll} className="gap-1.5 text-xs text-muted-foreground">
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </Button>
      </div>

      {/* Theme */}
      <div className="border border-border rounded-xl p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Theme</div>
          <div className="text-xs text-muted-foreground">Light or dark mode</div>
        </div>
        <Button variant="outline" size="sm" onClick={toggleTheme} className="gap-2">
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === 'dark' ? 'Light' : 'Dark'}
        </Button>
      </div>

      {/* Prime Bias engine */}
      <div className="border border-border rounded-xl p-4">
        <div className="text-sm font-semibold">Prime Bias Engine</div>
        <div className="text-xs text-muted-foreground mt-1">
          Locked to the verified production ruleset. Scoring weights, grade thresholds and block logic cannot be changed from Settings.
        </div>
      </div>

      {/* Install App */}
      <InstallCard />

      {/* Trading accounts + transactions */}
      <AccountsManager />

      {/* Backup / Export + Import */}
      <ExportBackup />
      <ImportBackup />

      {/* Display Settings */}
      <div className="border border-border rounded-xl px-4 divide-y divide-border/50">
        <SectionHeader title="Display" sub="What to show on cards" open={openSections.display} onToggle={() => toggle('display')} />
        {openSections.display && (
          <div className="pb-2 divide-y divide-border/30">
            <Toggle label="Why this trade?" sub="Show explanation on each card" value={s.showWhyThisTrade} onChange={v => update('showWhyThisTrade', v)} />
            <Toggle label="Alignment" sub="HIGH / MEDIUM / LOW indicator" value={s.showAlignment} onChange={v => update('showAlignment', v)} />
            <Toggle label="Score" sub="Show weighted score" value={s.showScore} onChange={v => update('showScore', v)} />
            <Toggle label="Backend score" sub="Show raw engine score and breakdowns" value={s.showBackendScore} onChange={v => update('showBackendScore', v)} />
            <Toggle label="Minimum Safe Move" sub="Show the ATR-derived minimum safe move (a floor, not a take-profit)" value={s.showTarget} onChange={v => update('showTarget', v)} />
            <Toggle label="Compact mode" sub="Smaller cards, hide block breakdown" value={s.compactMode} onChange={v => update('compactMode', v)} />
          </div>
        )}
      </div>

      {/* Input Settings */}
      <div className="border border-border rounded-xl px-4 divide-y divide-border/50">
        <SectionHeader title="Input Style" sub="How you enter indicator values" open={openSections.input} onToggle={() => toggle('input')} />
        {openSections.input && (
          <div className="py-3 space-y-2">
            {[
              { id: 'tap-cycle', label: 'Tap-cycle (default)', sub: 'Neutral → Buy → Sell — one tap each' },
              { id: 'buttons', label: 'Button input', sub: 'Explicit BUY / NEUTRAL / SELL buttons' },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => update('inputStyle', opt.id)}
                className={cn(
                  'w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                  s.inputStyle === opt.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                )}
              >
                <div className={cn('w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center', s.inputStyle === opt.id ? 'border-primary' : 'border-muted-foreground')}>
                  {s.inputStyle === opt.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.sub}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Trade Completion Mode */}
      <div className="border border-border rounded-xl px-4 divide-y divide-border/50">
        <SectionHeader title="Trade Completion" sub="How you log completed trades" open={openSections.completion} onToggle={() => toggle('completion')} />
        {openSections.completion && (
          <div className="py-3 space-y-2">
            {[
              { id: 'quick', label: 'Quick Mode (default)', sub: 'One tap to log — WIN / LOSS / BE / NOT TAKEN. Details optional.' },
              { id: 'detailed', label: 'Detailed Mode', sub: 'Full form before saving — entry, exit, P&L, notes.' },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => update('tradeCompletionMode', opt.id)}
                className={cn(
                  'w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                  s.tradeCompletionMode === opt.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                )}
              >
                <div className={cn('w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center', s.tradeCompletionMode === opt.id ? 'border-primary' : 'border-muted-foreground')}>
                  {s.tradeCompletionMode === opt.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.sub}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filter Defaults */}
      <div className="border border-border rounded-xl px-4 divide-y divide-border/50">
        <SectionHeader title="Default Filters" sub="Applied by default on dashboard" open={openSections.filters} onToggle={() => toggle('filters')} />
        {openSections.filters && (
          <div className="pb-2 divide-y divide-border/30">
            <Toggle label="A/B grades only" value={s.filterABOnly} onChange={v => update('filterABOnly', v)} />
            <Toggle label="Hide WAIT trades" value={s.filterHideWait} onChange={v => update('filterHideWait', v)} />
            <Toggle label="Hide EXTENDED trades" value={s.filterHideExtended} onChange={v => update('filterHideExtended', v)} />
            <Toggle label="Aligned only" value={s.filterAlignedOnly} onChange={v => update('filterAlignedOnly', v)} />
          </div>
        )}
      </div>

      {/* Analysis Log */}
      <div className="border border-border rounded-xl p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Analysis Log</div>
          <div className="text-xs text-muted-foreground">Every auto-saved bias analysis</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/history')} className="gap-2">
          <History className="w-4 h-4" />
          Open
        </Button>
      </div>

      {/* Welcome Tour */}
      <div className="border border-border rounded-xl p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Welcome Tour</div>
          <div className="text-xs text-muted-foreground">Replay the quick intro walkthrough</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event('openOnboarding'))} className="gap-2">
          <Sparkles className="w-4 h-4" />
          Replay
        </Button>
      </div>

      {/* How-To Guide */}
      <div className="border border-border rounded-xl p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Instructions for Use</div>
          <div className="text-xs text-muted-foreground">Detailed guide on how to use the engine</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowGuide(true)} className="gap-2">
          <BookOpen className="w-4 h-4" />
          Guide
        </Button>
      </div>

      {/* Account */}
      <div className="border border-border rounded-xl p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Account</div>
          <div className="text-xs text-muted-foreground truncate">
            {user?.email || 'Signed in'}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => logout()} className="gap-2 shrink-0">
          <LogOut className="w-4 h-4" />
          Sign out
        </Button>
      </div>

      <HowToGuide open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  );
}