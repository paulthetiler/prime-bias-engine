import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { X, BookOpen, Image as ImageIcon, Loader2, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { removeJournalScreenshots, signedJournalScreenshotUrls } from '@/lib/journalScreenshots';

const RESULT_COLORS = {
  win: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  loss: 'text-red-400 bg-red-500/10 border-red-500/30',
  breakeven: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  not_taken: 'text-muted-foreground bg-secondary border-border',
};
const RESULT_LABELS = { win: 'Win', loss: 'Loss', breakeven: 'B/E', not_taken: 'Not Taken' };
const GRADE_COLORS = { A: 'text-emerald-400', B: 'text-blue-400', C: 'text-yellow-400', D: 'text-orange-400', F: 'text-red-400' };
const PLAN_LABELS = { followed: '✅ Followed', partial: '🟡 Partial', broke_rules: '❌ Broke Rules', not_taken: '🚫 Not Taken' };

function JournalEntryDetail({ entry, onClose, onArchive, onRestore, onDelete, busy }) {
  const [screenshots, setScreenshots] = useState([]);
  const [screenshotsLoading, setScreenshotsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const dirColor = entry.direction === 'BUY' ? 'text-emerald-400' : entry.direction === 'SELL' ? 'text-red-400' : 'text-muted-foreground';

  useEffect(() => {
    let active = true;
    const paths = Array.isArray(entry.screenshot_paths) ? entry.screenshot_paths.filter(Boolean) : [];
    if (!paths.length) {
      setScreenshots([]);
      return undefined;
    }

    setScreenshotsLoading(true);
    signedJournalScreenshotUrls(paths)
      .then(items => { if (active) setScreenshots(items); })
      .catch(() => { if (active) setScreenshots([]); })
      .finally(() => { if (active) setScreenshotsLoading(false); });

    return () => { active = false; };
  }, [entry.screenshot_paths]);

  const archived = Boolean(entry.archived_at);
  const confirmCopy = confirmAction === 'delete'
    ? {
        title: 'Delete journal entry?',
        description: `This permanently deletes the ${entry.instrument} journal entry and its attached screenshots. The completed trade in Trade History will not be deleted.`,
        action: 'Delete permanently',
      }
    : {
        title: archived ? 'Restore journal entry?' : 'Archive journal entry?',
        description: archived
          ? 'This returns the journal entry to the normal Trade Journal list.'
          : 'This hides the journal entry from the normal list without deleting it or the linked completed trade.',
        action: archived ? 'Restore' : 'Archive',
      };

  const runConfirmedAction = async () => {
    if (confirmAction === 'delete') await onDelete(entry);
    else if (archived) await onRestore(entry);
    else await onArchive(entry);
    setConfirmAction(null);
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
        <div
          className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl overflow-y-auto"
          style={{ marginBottom: 'calc(64px + var(--safe-area-bottom))', maxHeight: 'calc(100vh - 120px)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl z-10">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-base font-bold">{entry.instrument}</div>
                {archived && <span className="text-[10px] rounded-full border border-border bg-secondary px-2 py-0.5 text-muted-foreground">Archived</span>}
              </div>
              <div className="text-xs text-muted-foreground">{entry.created_at ? format(new Date(entry.created_at), 'dd MMM yyyy HH:mm') : '—'}</div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="bg-secondary rounded-lg p-2">
                <div className={cn('font-bold', RESULT_COLORS[entry.result]?.split(' ')[0])}>{RESULT_LABELS[entry.result]}</div>
                <div className="text-muted-foreground">Result</div>
              </div>
              <div className="bg-secondary rounded-lg p-2">
                <div className={cn('font-bold', GRADE_COLORS[entry.grade])}>{entry.grade}</div>
                <div className="text-muted-foreground">Grade</div>
              </div>
              <div className="bg-secondary rounded-lg p-2">
                <div className={cn('font-bold', dirColor)}>{entry.direction}</div>
                <div className="text-muted-foreground">Dir</div>
              </div>
              <div className="bg-secondary rounded-lg p-2">
                <div className="font-bold font-mono">{entry.score}</div>
                <div className="text-muted-foreground">Score</div>
              </div>
            </div>

            {entry.followed_plan && (
              <div className="rounded-xl bg-secondary/40 border border-border px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Followed Plan</div>
                <div className="text-sm font-semibold">{PLAN_LABELS[entry.followed_plan]}</div>
              </div>
            )}

            {entry.what_happened && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">What Happened</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{entry.what_happened}</p>
              </div>
            )}

            {(screenshotsLoading || screenshots.length > 0) && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Screenshots</div>
                {screenshotsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading screenshots…
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {screenshots.map(item => (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => setPreviewUrl(item.url)}
                        className="aspect-square rounded-lg overflow-hidden border border-border bg-secondary"
                      >
                        <img src={item.url} alt="Trade journal screenshot" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {entry.mistake_tags?.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Execution Tags</div>
                <div className="flex flex-wrap gap-1.5">
                  {entry.mistake_tags.map(t => (
                    <span key={t} className="px-2 py-1 rounded-full text-xs bg-secondary border border-border text-muted-foreground">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {entry.lesson_tags?.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Lesson Tags</div>
                <div className="flex flex-wrap gap-1.5">
                  {entry.lesson_tags.map(t => (
                    <span key={t} className="px-2 py-1 rounded-full text-xs bg-primary/10 border border-primary/30 text-primary">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {entry.lesson && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Lesson</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{entry.lesson}</p>
              </div>
            )}

            <div className="border-t border-border pt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                className="flex-1 gap-1.5"
                onClick={() => setConfirmAction('archive')}
              >
                {archived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                {archived ? 'Restore' : 'Archive'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                className="flex-1 text-destructive hover:text-destructive gap-1.5"
                onClick={() => setConfirmAction('delete')}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            </div>
          </div>
        </div>

        {previewUrl && (
          <div
            className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4"
            onClick={(e) => { e.stopPropagation(); setPreviewUrl(null); }}
          >
            <button
              type="button"
              aria-label="Close screenshot preview"
              onClick={() => setPreviewUrl(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={previewUrl} alt="Trade journal screenshot preview" className="max-w-full max-h-full object-contain rounded-lg" />
          </div>
        )}
      </div>

      <AlertDialog open={Boolean(confirmAction)} onOpenChange={open => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmCopy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={runConfirmedAction} className={confirmAction === 'delete' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}>
              {busy ? 'Working…' : confirmCopy.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function TradeJournalTab() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('active');

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['journalEntries'],
    queryFn: () => base44.entities.TradeJournalEntry.list('-created_at', 200),
  });

  const visibleEntries = useMemo(
    () => entries.filter(entry => view === 'archived' ? Boolean(entry.archived_at) : !entry.archived_at),
    [entries, view]
  );
  const archivedCount = entries.filter(entry => entry.archived_at).length;

  const updateEntry = useMutation({
    mutationFn: ({ id, values }) => base44.entities.TradeJournalEntry.update(id, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['journalEntries'] }),
  });

  const archiveEntry = async (entry) => {
    try {
      await updateEntry.mutateAsync({ id: entry.id, values: { archived_at: new Date().toISOString() } });
      setSelected(null);
      toast.success('Journal entry archived');
    } catch {
      toast.error('Failed to archive journal entry');
    }
  };

  const restoreEntry = async (entry) => {
    try {
      await updateEntry.mutateAsync({ id: entry.id, values: { archived_at: null } });
      setSelected(null);
      toast.success('Journal entry restored');
    } catch {
      toast.error('Failed to restore journal entry');
    }
  };

  const deleteEntry = async (entry) => {
    const screenshotPaths = Array.isArray(entry.screenshot_paths) ? entry.screenshot_paths.filter(Boolean) : [];
    try {
      if (screenshotPaths.length) await removeJournalScreenshots(screenshotPaths);
      await base44.entities.TradeJournalEntry.delete(entry.id);
      await qc.invalidateQueries({ queryKey: ['journalEntries'] });
      setSelected(null);
      toast.success('Journal entry deleted');
    } catch {
      toast.error('Failed to delete journal entry');
    }
  };

  if (isLoading) {
    return <div className="space-y-2 pt-2">{[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-secondary animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-2 pt-2">
      {archivedCount > 0 && (
        <div className="flex items-center gap-2 pb-1">
          <button
            onClick={() => setView('active')}
            className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold', view === 'active' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}
          >
            Current
          </button>
          <button
            onClick={() => setView('archived')}
            className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold', view === 'archived' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}
          >
            Archived ({archivedCount})
          </button>
        </div>
      )}

      {visibleEntries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>{view === 'archived' ? 'No archived journal entries.' : 'No journal entries yet.'}</p>
          {view === 'active' && <p className="text-xs mt-1">Complete a trade and tap "Journal this trade"</p>}
        </div>
      ) : (
        visibleEntries.map(entry => {
          const screenshotCount = Array.isArray(entry.screenshot_paths) ? entry.screenshot_paths.length : 0;
          return (
            <button
              key={entry.id}
              onClick={() => setSelected(entry)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:bg-accent/50 transition-colors text-left"
            >
              <div className={cn('px-2.5 py-1 rounded-lg border text-xs font-bold shrink-0', RESULT_COLORS[entry.result])}>
                {RESULT_LABELS[entry.result] || '—'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{entry.instrument}</span>
                  <span className={cn('text-xs font-bold', GRADE_COLORS[entry.grade])}>{entry.grade}</span>
                  <span className={cn('text-xs font-semibold', entry.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400')}>{entry.direction}</span>
                  {screenshotCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <ImageIcon className="w-3 h-3" /> {screenshotCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {entry.followed_plan && (
                    <span className="text-[10px] text-muted-foreground">{PLAN_LABELS[entry.followed_plan]}</span>
                  )}
                  {entry.mistake_tags?.slice(0, 2).map(t => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">{t}</span>
                  ))}
                </div>
                {entry.lesson && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{entry.lesson}</p>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground shrink-0 text-right">
                {entry.created_at ? format(new Date(entry.created_at), 'dd MMM') : ''}
              </div>
            </button>
          );
        })
      )}

      {selected && (
        <JournalEntryDetail
          entry={selected}
          onClose={() => setSelected(null)}
          onArchive={archiveEntry}
          onRestore={restoreEntry}
          onDelete={deleteEntry}
          busy={updateEntry.isPending}
        />
      )}
    </div>
  );
}
