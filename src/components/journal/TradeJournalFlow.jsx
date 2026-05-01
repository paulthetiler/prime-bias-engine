import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { X, ChevronRight, CheckCircle2, BookOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';

const FOLLOWED_PLAN_OPTIONS = [
  { value: 'followed',    label: 'Followed Plan',  emoji: '✅', color: 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  { value: 'partial',     label: 'Partial',        emoji: '🟡', color: 'border-yellow-500 bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' },
  { value: 'broke_rules', label: 'Broke Rules',    emoji: '❌', color: 'border-red-500 bg-red-500/15 text-red-600 dark:text-red-400' },
  { value: 'not_taken',   label: 'Not Taken',      emoji: '🚫', color: 'border-muted-foreground/50 bg-secondary text-muted-foreground' },
];

const MISTAKE_TAGS = [
  'Entered early', 'Entered late', 'Hesitated', 'Chased', 'Took clear setup',
  'Ignored warning', 'Good patience', 'Bad exit', 'Good exit',
];

const LESSON_TAGS = [
  'Wait for cleaner entry', 'Trust the grade', 'Avoid weak alignment',
  'Stop after daily target', 'Less is more', 'Good trade, repeat it', 'Poor trade, avoid it',
];

const RESULT_LABELS = {
  win: '✅ WIN', loss: '❌ LOSS', breakeven: '➖ BREAK EVEN', not_taken: '🚫 NOT TAKEN',
};

const RESULT_COLORS = {
  win: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
  loss: 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300',
  breakeven: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-300',
  not_taken: 'bg-secondary border-border text-muted-foreground',
};

function StepIndicator({ step, total }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all',
            i < step ? 'bg-primary w-4' : i === step ? 'bg-primary w-6' : 'bg-secondary w-4'
          )}
        />
      ))}
    </div>
  );
}

function TagButton({ label, selected, onToggle }) {
  return (
    <button
      onClick={() => onToggle(label)}
      className={cn(
        'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
        selected
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-secondary border-border text-muted-foreground hover:border-primary/50'
      )}
    >
      {label}
    </button>
  );
}

export default function TradeJournalFlow({ trade, onClose, onDone }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0); // 0,1,2,3 = what happened, plan, lesson, done
  const [whatHappened, setWhatHappened] = useState('');
  const [followedPlan, setFollowedPlan] = useState('');
  const [mistakeTags, setMistakeTags] = useState([]);
  const [lessonTags, setLessonTags] = useState([]);
  const [lesson, setLesson] = useState('');
  const [saving, setSaving] = useState(false);

  if (!trade) return null;

  const toggleTag = (setter, tag) =>
    setter(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.TradeJournalEntry.create({
        completed_trade_id: trade.id,
        instrument: trade.instrument,
        result: trade.result,
        direction: trade.direction,
        grade: trade.grade,
        score: trade.score,
        trade_status: trade.trade_status,
        trade_action: trade.trade_action,
        target: trade.target,
        alignment: trade.alignment,
        deep_trend: trade.deep_trend,
        dd_bias: trade.dd_bias,
        now_bias: trade.now_bias,
        followed_plan: followedPlan || null,
        mistake_tags: mistakeTags,
        lesson_tags: lessonTags,
        what_happened: whatHappened || null,
        lesson: lesson || null,
        created_at: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ['journalEntries'] });
      setStep(3);
    } catch {
      toast.error('Failed to save journal entry');
    }
    setSaving(false);
  };

  const dirColor = trade.direction === 'BUY'
    ? 'text-emerald-600 dark:text-emerald-400'
    : trade.direction === 'SELL'
    ? 'text-red-600 dark:text-red-400'
    : 'text-muted-foreground';

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 60px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <BookOpen className="w-4 h-4 text-primary" />
            <div>
              <div className="text-sm font-bold">Journal Trade</div>
              <div className="text-xs text-muted-foreground font-mono">{trade.instrument}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {step < 3 && <StepIndicator step={step} total={3} />}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">

          {/* Trade snapshot — always visible on steps 0-2 */}
          {step < 3 && (
            <div className={cn('rounded-xl border px-3 py-2.5', RESULT_COLORS[trade.result])}>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-sm">{trade.instrument}</span>
                  <span className={cn('font-bold', dirColor)}>{trade.direction}</span>
                  <span>Grade <strong>{trade.grade}</strong></span>
                  <span className="font-mono">Score: <strong>{trade.score}</strong></span>
                </div>
                <span className="font-semibold shrink-0">{RESULT_LABELS[trade.result]}</span>
              </div>
              {trade.completed_at && (
                <div className="text-[11px] opacity-70 mt-1">
                  {format(new Date(trade.completed_at), 'dd MMM yyyy HH:mm')}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 0: What Happened ── */}
          {step === 0 && (
            <div className="space-y-3">
              <div className="text-sm font-bold">What happened?</div>
              <textarea
                value={whatHappened}
                onChange={e => setWhatHappened(e.target.value)}
                placeholder="Briefly describe the trade — setup, entry, outcome... (optional)"
                rows={4}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
              <Button className="w-full gap-2" onClick={() => setStep(1)}>
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* ── STEP 1: Did I follow the plan? ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="text-sm font-bold">Did I follow the plan?</div>
              <div className="grid grid-cols-2 gap-2">
                {FOLLOWED_PLAN_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFollowedPlan(opt.value)}
                    className={cn(
                      'rounded-xl border-2 py-3 px-2 text-sm font-bold transition-all active:scale-95',
                      followedPlan === opt.value ? opt.color : 'border-border bg-secondary text-foreground hover:border-primary/50'
                    )}
                  >
                    <div className="text-xl mb-1">{opt.emoji}</div>
                    <div>{opt.label}</div>
                  </button>
                ))}
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Execution tags</div>
                <div className="flex flex-wrap gap-2">
                  {MISTAKE_TAGS.map(tag => (
                    <TagButton
                      key={tag}
                      label={tag}
                      selected={mistakeTags.includes(tag)}
                      onToggle={tag => toggleTag(setMistakeTags, tag)}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(0)}>Back</Button>
                <Button className="flex-1 gap-2" onClick={() => setStep(2)} disabled={!followedPlan}>
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Lesson ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="text-sm font-bold">What's the lesson?</div>
              <div className="flex flex-wrap gap-2">
                {LESSON_TAGS.map(tag => (
                  <TagButton
                    key={tag}
                    label={tag}
                    selected={lessonTags.includes(tag)}
                    onToggle={tag => toggleTag(setLessonTags, tag)}
                  />
                ))}
              </div>
              <textarea
                value={lesson}
                onChange={e => setLesson(e.target.value)}
                placeholder="Your own reflection... (optional)"
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
                <Button className="flex-1 gap-2" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                  {saving ? 'Saving…' : 'Save Journal'}
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Done ── */}
          {step === 3 && (
            <div className="space-y-4 text-center py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              </div>
              <div>
                <div className="text-base font-bold">Journal saved</div>
                <div className="text-sm text-muted-foreground mt-1">{trade.instrument} entry added to your trade journal</div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onDone}>Back to Summary</Button>
                <Button className="flex-1 gap-2" onClick={() => { onDone(); navigate('/journal'); }}>
                  <BookOpen className="w-4 h-4" /> View Journal
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}