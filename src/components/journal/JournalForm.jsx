import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const Field = ({ label, children }) => (
  <div>
    <label className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-1">{label}</label>
    {children}
  </div>
);

const NumInput = ({ value, onChange, placeholder }) => (
  <input
    type="number"
    step="any"
    value={value ?? ''}
    onChange={e => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
    placeholder={placeholder}
    className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
  />
);

export default function JournalForm({ initial, onSave, onCancel, saving }) {
  const now = new Date();
  const [form, setForm] = useState({
    month: initial?.month || MONTHS[now.getMonth()],
    year: initial?.year || now.getFullYear(),
    start_balance: initial?.start_balance ?? null,
    end_balance: initial?.end_balance ?? null,
    pnl: initial?.pnl ?? null,
    pnl_percent: initial?.pnl_percent ?? null,
    total_positions: initial?.total_positions ?? null,
    winrate: initial?.winrate ?? null,
    total_pips: initial?.total_pips ?? null,
    ave_win: initial?.ave_win ?? null,
    ave_pip: initial?.ave_pip ?? null,
    bid_size: initial?.bid_size ?? null,
    next_bid: initial?.next_bid ?? null,
    wage: initial?.wage ?? null,
    goal_month: initial?.goal_month ?? null,
    goal_week: initial?.goal_week ?? null,
    goal_day: initial?.goal_day ?? null,
    rules: initial?.rules || [''],
    notes: initial?.notes || '',
  });

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const setRule = (i, val) => {
    const rules = [...form.rules];
    rules[i] = val;
    set('rules', rules);
  };
  const addRule = () => set('rules', [...form.rules, '']);
  const removeRule = (i) => set('rules', form.rules.filter((_, idx) => idx !== i));

  // Auto-calc P&L and % from balances
  const handleBalanceChange = (key, val) => {
    const next = { ...form, [key]: val };
    if (next.start_balance && next.end_balance) {
      next.pnl = parseFloat((next.end_balance - next.start_balance).toFixed(2));
      next.pnl_percent = parseFloat(((next.pnl / next.start_balance) * 100).toFixed(4));
    }
    setForm(next);
  };

  const handleSubmit = () => {
    const cleaned = {
      ...form,
      rules: form.rules.filter(r => r.trim()),
      winrate: form.winrate ? parseFloat(form.winrate) : null,
    };
    onSave(cleaned);
  };

  return (
    <div className="space-y-5">
      {/* Month / Year */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Month">
          <select
            value={form.month}
            onChange={e => set('month', e.target.value)}
            className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {MONTHS.map(m => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Year">
          <NumInput value={form.year} onChange={v => set('year', v)} placeholder="2025" />
        </Field>
      </div>

      {/* Balances */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Balance</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start Balance £">
            <NumInput value={form.start_balance} onChange={v => handleBalanceChange('start_balance', v)} placeholder="200" />
          </Field>
          <Field label="End Balance £">
            <NumInput value={form.end_balance} onChange={v => handleBalanceChange('end_balance', v)} placeholder="250" />
          </Field>
          <Field label="P&L £">
            <NumInput value={form.pnl} onChange={v => set('pnl', v)} placeholder="auto" />
          </Field>
          <Field label="P&L %">
            <NumInput value={form.pnl_percent} onChange={v => set('pnl_percent', v)} placeholder="auto" />
          </Field>
        </div>
      </div>

      {/* Performance */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Performance</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Positions">
            <NumInput value={form.total_positions} onChange={v => set('total_positions', v)} placeholder="0" />
          </Field>
          <Field label="Winrate (0–1)">
            <NumInput value={form.winrate} onChange={v => set('winrate', v)} placeholder="0.65" />
          </Field>
          <Field label="Total Pips">
            <NumInput value={form.total_pips} onChange={v => set('total_pips', v)} placeholder="0" />
          </Field>
          <Field label="Ave Win £">
            <NumInput value={form.ave_win} onChange={v => set('ave_win', v)} placeholder="0" />
          </Field>
          <Field label="Ave PIPs">
            <NumInput value={form.ave_pip} onChange={v => set('ave_pip', v)} placeholder="0" />
          </Field>
          <Field label="Wage £">
            <NumInput value={form.wage} onChange={v => set('wage', v)} placeholder="0" />
          </Field>
        </div>
      </div>

      {/* Lot Sizing */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Lot Sizing</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bid Size">
            <NumInput value={form.bid_size} onChange={v => set('bid_size', v)} placeholder="0.5" />
          </Field>
          <Field label="Next Bid">
            <NumInput value={form.next_bid} onChange={v => set('next_bid', v)} placeholder="0.525" />
          </Field>
        </div>
      </div>

      {/* Goals */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Goals</div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Month £">
            <NumInput value={form.goal_month} onChange={v => set('goal_month', v)} placeholder="500" />
          </Field>
          <Field label="Week £">
            <NumInput value={form.goal_week} onChange={v => set('goal_week', v)} placeholder="125" />
          </Field>
          <Field label="Day £">
            <NumInput value={form.goal_day} onChange={v => set('goal_day', v)} placeholder="25" />
          </Field>
        </div>
      </div>

      {/* Rules */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Trading Rules</div>
        <div className="space-y-2">
          {form.rules.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground w-4 shrink-0">{i + 1}.</span>
              <input
                type="text"
                value={r}
                onChange={e => setRule(i, e.target.value)}
                placeholder={`Rule ${i + 1}`}
                className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {form.rules.length > 1 && (
                <button onClick={() => removeRule(i)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          <button onClick={addRule} className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1">
            <Plus className="w-3.5 h-3.5" /> Add rule
          </button>
        </div>
      </div>

      {/* Notes */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Notes / Reflections</div>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="What worked? What didn't? Key lessons..."
          rows={3}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button className="flex-1" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}