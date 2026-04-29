import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Trash2, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export default function History() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);

  const { data: analyses = [], isLoading } = useQuery({
    queryKey: ['biasHistory'],
    queryFn: () => base44.entities.BiasAnalysis.list('-created_date', 50),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.BiasAnalysis.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['biasHistory'] });
      toast.success('Deleted');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BiasAnalysis.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['biasHistory'] });
      setSelected(null);
      toast.success('Updated');
    },
  });

  const gradeColors = {
    A: 'text-emerald-400',
    B: 'text-blue-400',
    C: 'text-yellow-400',
    D: 'text-orange-400',
    F: 'text-red-400',
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-lg font-bold tracking-tight">History</h1>
        <span className="text-xs text-muted-foreground">{analyses.length} analyses</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-20 rounded-xl bg-secondary animate-pulse" />
          ))}
        </div>
      ) : analyses.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No analyses saved yet. Save one from the Input screen.
        </div>
      ) : (
        <div className="space-y-2">
          {analyses.map(a => (
            <div key={a.id} className="flex items-center gap-2">
              <button
                onClick={() => setSelected(a)}
                className="flex-1 flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:bg-accent/50 transition-colors text-left min-w-0"
              >
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                  a.overall_bias === 'BUY' ? 'bg-emerald-500/15' : a.overall_bias === 'SELL' ? 'bg-red-500/15' : 'bg-secondary'
                )}>
                  {a.overall_bias === 'BUY' ? <TrendingUp className="w-5 h-5 text-emerald-400" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{a.instrument}</span>
                    <span className={cn('text-xs font-bold', gradeColors[a.grade])}>{a.grade}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{a.confidence_score}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {a.timestamp ? format(new Date(a.timestamp), 'dd MMM yyyy HH:mm') : format(new Date(a.created_date), 'dd MMM yyyy HH:mm')}
                    {a.outcome && a.outcome !== 'pending' && (
                      <span className={cn('ml-2 uppercase font-semibold',
                        a.outcome === 'win' ? 'text-emerald-400' : a.outcome === 'loss' ? 'text-red-400' : 'text-muted-foreground'
                      )}>• {a.outcome}</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => deleteMutation.mutate(a.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected?.instrument}
              <span className={cn('text-sm', gradeColors[selected?.grade])}>{selected?.grade}</span>
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="bg-secondary rounded-lg p-2">
                  <div className="font-bold">{selected.overall_bias}</div>
                  <div className="text-[10px] text-muted-foreground">Bias</div>
                </div>
                <div className="bg-secondary rounded-lg p-2">
                  <div className="font-bold font-mono">{selected.confidence_score}</div>
                  <div className="text-[10px] text-muted-foreground">Score</div>
                </div>
                <div className="bg-secondary rounded-lg p-2">
                  <div className="font-bold">{selected.trade_action}</div>
                  <div className="text-[10px] text-muted-foreground">Action</div>
                </div>
              </div>

              {selected.warnings?.length > 0 && (
                <div className="space-y-1">
                  {selected.warnings.map((w, i) => (
                    <div key={i} className="text-xs text-yellow-300 bg-yellow-500/10 rounded p-2">{w}</div>
                  ))}
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Outcome</label>
                <Select
                  value={selected.outcome || 'pending'}
                  onValueChange={(v) => updateMutation.mutate({ id: selected.id, data: { outcome: v } })}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="win">Win</SelectItem>
                    <SelectItem value="loss">Loss</SelectItem>
                    <SelectItem value="breakeven">Breakeven</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                <Textarea
                  defaultValue={selected.notes || ''}
                  placeholder="Add notes..."
                  className="h-20"
                  onBlur={(e) => {
                    if (e.target.value !== (selected.notes || '')) {
                      updateMutation.mutate({ id: selected.id, data: { notes: e.target.value } });
                    }
                  }}
                />
              </div>

              <Button
                variant="destructive"
                size="sm"
                className="w-full gap-2"
                onClick={() => {
                  deleteMutation.mutate(selected.id);
                  setSelected(null);
                }}
              >
                <Trash2 className="w-4 h-4" /> Delete Analysis
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}