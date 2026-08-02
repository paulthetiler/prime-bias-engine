import React, { useRef, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

// Entity name (in the backup file) -> { table, columns we accept }.
// We whitelist columns so Base44 system fields (created_by, is_sample, …) that
// don't exist in our Supabase tables are simply dropped instead of erroring.
const IMPORT_MAP = {
  BiasAnalysis: {
    table: 'bias_analysis',
    columns: ['id', 'created_date', 'instrument', 'timestamp', 'inputs', 'results',
      'overall_bias', 'grade', 'confidence_score', 'trade_action', 'warnings', 'notes', 'outcome'],
  },
  CompletedTrade: {
    table: 'completed_trade',
    columns: ['id', 'created_date', 'instrument', 'status', 'result', 'direction', 'grade',
      'trade_status', 'trade_action', 'score', 'target', 'alignment', 'deep_trend', 'deep_strength',
      'dd_bias', 'dd_strength', 'now_bias', 'now_strength', 'extra_check_h1', 'extra_check_m15',
      'inputs_snapshot', 'created_at', 'completed_at', 'entry_price', 'exit_price', 'pnl',
      'exit_reason', 'notes', 'screenshot_url'],
  },
  MonthlyJournal: {
    table: 'monthly_journal',
    columns: ['id', 'created_date', 'month', 'year', 'start_balance', 'end_balance', 'pnl',
      'pnl_percent', 'total_positions', 'winrate', 'total_pips', 'ave_win', 'ave_pip', 'bid_size',
      'next_bid', 'wage', 'goal_month', 'goal_week', 'goal_day', 'rules', 'notes'],
  },
  TradeJournalEntry: {
    table: 'trade_journal_entry',
    columns: ['id', 'created_date', 'completed_trade_id', 'instrument', 'result', 'direction',
      'grade', 'score', 'trade_status', 'trade_action', 'target', 'alignment', 'deep_trend',
      'dd_bias', 'now_bias', 'followed_plan', 'mistake_tags', 'lesson_tags', 'what_happened',
      'lesson', 'screenshot_url', 'created_at'],
  },
};

function pick(row, columns) {
  const out = {};
  for (const c of columns) {
    if (row[c] !== undefined) out[c] = row[c];
  }
  return out;
}

// One-time restore of a PrimeBias backup (JSON from the Export button) into
// Supabase. Safe to re-run: rows are upserted by id.
export default function ImportBackup() {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    if (!supabase) {
      toast.error('Supabase is not configured — cannot import.');
      return;
    }

    setBusy(true);
    try {
      const payload = JSON.parse(await file.text());
      if (payload?.app !== 'PrimeBias' || !payload?.entities) {
        toast.error('That does not look like a PrimeBias backup file.');
        setBusy(false);
        return;
      }

      const counts = {};
      for (const [name, cfg] of Object.entries(IMPORT_MAP)) {
        const rows = Array.isArray(payload.entities[name]) ? payload.entities[name] : [];
        counts[name] = 0;
        if (!rows.length) continue;
        const cleaned = rows.map((r) => pick(r, cfg.columns));
        const { error } = await supabase.from(cfg.table).upsert(cleaned, { onConflict: 'id' });
        if (error) throw error;
        counts[name] = cleaned.length;
      }

      // Restore local settings / active analyses / ATR overrides / theme.
      if (payload.localStorage && typeof payload.localStorage === 'object') {
        for (const [k, v] of Object.entries(payload.localStorage)) {
          if (k.startsWith('primebias_') || k === 'theme') {
            try { localStorage.setItem(k, v); } catch { /* ignore quota */ }
          }
        }
      }

      toast.success(
        `Imported · ${counts.CompletedTrade} trades, ${counts.TradeJournalEntry} journal, ` +
        `${counts.MonthlyJournal} monthly, ${counts.BiasAnalysis} analyses`
      );
      setDone(true);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || 'Import failed — check the file and try again.');
    }
    setBusy(false);
  };

  return (
    <div className="border border-border rounded-xl p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">Import / Restore Data</div>
        <div className="text-xs text-muted-foreground">
          Load a PrimeBias backup JSON (e.g. your export from Base44) into this account. Safe to re-run.
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onFile}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="gap-2 shrink-0"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <CheckCircle2 className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
        {busy ? 'Importing…' : done ? 'Imported' : 'Import'}
      </Button>
    </div>
  );
}
