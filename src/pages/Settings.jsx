import React, { useState } from 'react';
import { useTheme } from '@/lib/useTheme';
import { Button } from '@/components/ui/button';
import { Moon, Sun, BookOpen, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import HowToGuide from '@/components/HowToGuide';
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

function NumInput({ label, value, onChange, min = 0, max = 100 }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-foreground flex-1">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-7 h-7 rounded bg-secondary border border-border text-sm font-bold"
        >−</button>
        <span className="w-8 text-center font-mono text-sm font-semibold">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-7 h-7 rounded bg-secondary border border-border text-sm font-bold"
        >+</button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const [showGuide, setShowGuide] = useState(false);
  const [s, setS] = useState(getSettings());
  const [openSections, setOpenSections] = useState({
    display: true, input: false, completion: false, filters: false, advanced: false, weights: false, thresholds: false
  });

  const toggle = (key) => setOpenSections(o => ({ ...o, [key]: !o[key] }));
  const update = (key, value) => {
    const next = { ...s, [key]: value };
    setS(next);
    saveSettings(next);
  };
  const updateWeight = (key, value) => {
    const next = { ...s, weights: { ...s.weights, [key]: value } };
    setS(next);
    saveSettings(next);
  };
  const updateThreshold = (key, value) => {
    const next = { ...s, gradeThresholds: { ...s.gradeThresholds, [key]: value } };
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

      {/* Display Settings */}
      <div className="border border-border rounded-xl px-4 divide-y divide-border/50">
        <SectionHeader title="Display" sub="What to show on cards" open={openSections.display} onToggle={() => toggle('display')} />
        {openSections.display && (
          <div className="pb-2 divide-y divide-border/30">
            <Toggle label="Why this trade?" sub="Show explanation on each card" value={s.showWhyThisTrade} onChange={v => update('showWhyThisTrade', v)} />
            <Toggle label="Alignment" sub="HIGH / MEDIUM / LOW indicator" value={s.showAlignment} onChange={v => update('showAlignment', v)} />
            <Toggle label="Score" sub="Show weighted score" value={s.showScore} onChange={v => update('showScore', v)} />
            <Toggle label="Backend score" sub="Show raw engine score and breakdowns" value={s.showBackendScore} onChange={v => update('showBackendScore', v)} />
            <Toggle label="Target" sub="Show calculated price target" value={s.showTarget} onChange={v => update('showTarget', v)} />
            <Toggle label="Notes" sub="Show notes on cards" value={s.showNotes} onChange={v => update('showNotes', v)} />
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

      {/* Advanced Logic */}
      <div className="border border-border rounded-xl px-4 divide-y divide-border/50">
        <SectionHeader title="Advanced Logic" sub="Experimental — use with caution" open={openSections.advanced} onToggle={() => toggle('advanced')} />
        {openSections.advanced && (
          <div className="pb-2 divide-y divide-border/30">
            <div className="py-2">
              <div className="text-[10px] uppercase tracking-widest text-orange-400 font-semibold">⚠ Advanced</div>
            </div>
            <Toggle label="M5 override logic" sub="Use M5 to override Now block direction" value={s.useM5Override} onChange={v => update('useM5Override', v)} />
            <Toggle label="Downgrade on NOW weakness" sub="Cap grade if Now is WEAK" value={s.downgradeOnNowWeakness} onChange={v => update('downgradeOnNowWeakness', v)} />
            <Toggle label="Require alignment for A grade" sub="A grade needs all blocks aligned" value={s.requireAlignmentForA} onChange={v => update('requireAlignmentForA', v)} />
          </div>
        )}
      </div>

      {/* Scoring Weights */}
      <div className="border border-border rounded-xl px-4 divide-y divide-border/50">
        <div className="flex items-center py-3">
          <button onClick={() => toggle('weights')} className="flex-1 flex items-center justify-between text-left">
            <div>
              <div className="text-sm font-semibold">Scoring Weights</div>
              <div className="text-xs text-muted-foreground">Points per timeframe in grade calculation</div>
            </div>
            {openSections.weights ? <ChevronUp className="w-4 h-4 text-muted-foreground mr-2" /> : <ChevronDown className="w-4 h-4 text-muted-foreground mr-2" />}
          </button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); const next = { ...s, weights: { ...DEFAULTS.weights } }; setS(next); saveSettings(next); }} className="gap-1.5 text-xs text-muted-foreground shrink-0">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </Button>
        </div>
        {openSections.weights && (
          <div className="py-2 divide-y divide-border/30">
            <div className="py-1">
              <div className="text-[10px] uppercase tracking-widest text-orange-400 font-semibold">⚠ Advanced — affects engine</div>
            </div>
            {[
              { key: 'month', label: 'Month' }, { key: 'week', label: 'Week' },
              { key: 'day', label: 'Day' },     { key: 'h4', label: 'H4' },
              { key: 'h1', label: 'H1' },       { key: 'm15', label: 'M15' },
              { key: 'm5', label: 'M5' },
            ].map(tf => (
              <NumInput key={tf.key} label={tf.label} value={s.weights[tf.key]} onChange={v => updateWeight(tf.key, v)} max={99} />
            ))}
            <div className="py-1 text-xs text-muted-foreground">
              Total: {Object.values(s.weights).reduce((a, b) => a + b, 0)} pts (base)
            </div>
          </div>
        )}
      </div>

      {/* Grade Thresholds */}
      <div className="border border-border rounded-xl px-4 divide-y divide-border/50">
        <div className="flex items-center py-3">
          <button onClick={() => toggle('thresholds')} className="flex-1 flex items-center justify-between text-left">
            <div>
              <div className="text-sm font-semibold">Grade Thresholds</div>
              <div className="text-xs text-muted-foreground">Min score for each grade</div>
            </div>
            {openSections.thresholds ? <ChevronUp className="w-4 h-4 text-muted-foreground mr-2" /> : <ChevronDown className="w-4 h-4 text-muted-foreground mr-2" />}
          </button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); const next = { ...s, gradeThresholds: { ...DEFAULTS.gradeThresholds } }; setS(next); saveSettings(next); }} className="gap-1.5 text-xs text-muted-foreground shrink-0">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </Button>
        </div>
        {openSections.thresholds && (
          <div className="py-2 divide-y divide-border/30">
            <div className="py-1">
              <div className="text-[10px] uppercase tracking-widest text-orange-400 font-semibold">⚠ Advanced — affects engine</div>
            </div>
            {[
              { key: 'extended', label: 'Extended (F)' }, { key: 'risky', label: 'Risky (C→)' },
              { key: 'A', label: 'A grade' },             { key: 'B', label: 'B grade' },
              { key: 'C', label: 'C grade' },             { key: 'D', label: 'D grade' },
            ].map(t => (
              <NumInput key={t.key} label={t.label} value={s.gradeThresholds[t.key]} onChange={v => updateThreshold(t.key, v)} max={100} />
            ))}
          </div>
        )}
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

      <HowToGuide open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  );
}