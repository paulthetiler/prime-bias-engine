import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Download, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

async function safeList(label, fn) {
  try {
    const rows = await fn();
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.warn(`Export: failed to fetch ${label}`, e);
    return null; // null = fetch error (distinct from empty)
  }
}

// Pulls ALL Base44 records + every local setting into one downloadable JSON.
// Run this from your live (logged-in) app before migrating off Base44.
export default function ExportBackup() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const [BiasAnalysis, CompletedTrade, MonthlyJournal, TradeJournalEntry] = await Promise.all([
        safeList('BiasAnalysis', () => base44.entities.BiasAnalysis.list('-created_date', 100000)),
        safeList('CompletedTrade', () => base44.entities.CompletedTrade.list('-created_date', 100000)),
        safeList('MonthlyJournal', () => base44.entities.MonthlyJournal.list('-created_date', 100000)),
        safeList('TradeJournalEntry', () => base44.entities.TradeJournalEntry.list('-created_date', 100000)),
      ]);

      if ([BiasAnalysis, CompletedTrade, MonthlyJournal, TradeJournalEntry].every(v => v === null)) {
        toast.error('Could not reach your data — make sure you are logged in, then retry.');
        setBusy(false);
        return;
      }

      // Every PrimeBias local setting / active analysis / ATR override, plus theme.
      const localStorageDump = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('primebias_') || k === 'theme')) {
          localStorageDump[k] = localStorage.getItem(k);
        }
      }

      const payload = {
        app: 'PrimeBias',
        schema: 1,
        exportedAt: new Date().toISOString(),
        entities: {
          BiasAnalysis: BiasAnalysis || [],
          CompletedTrade: CompletedTrade || [],
          MonthlyJournal: MonthlyJournal || [],
          TradeJournalEntry: TradeJournalEntry || [],
        },
        localStorage: localStorageDump,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `primebias-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const c = payload.entities;
      toast.success(
        `Backup saved · ${c.CompletedTrade.length} trades, ${c.TradeJournalEntry.length} journal, ${c.MonthlyJournal.length} monthly, ${c.BiasAnalysis.length} analyses`
      );
      setDone(true);
    } catch (e) {
      console.error(e);
      toast.error('Export failed — please try again.');
    }
    setBusy(false);
  };

  return (
    <div className="border border-border rounded-xl p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">Backup / Export Data</div>
        <div className="text-xs text-muted-foreground">
          Download all your trades, journals and settings as a JSON file. Do this before migrating off Base44.
        </div>
      </div>
      <Button size="sm" onClick={run} disabled={busy} className="gap-2 shrink-0">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <CheckCircle2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
        {busy ? 'Exporting…' : done ? 'Saved' : 'Export'}
      </Button>
    </div>
  );
}
