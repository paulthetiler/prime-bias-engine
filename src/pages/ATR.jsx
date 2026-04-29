import React, { useState, useEffect } from 'react';
import { ASSETS } from '@/lib/biasEngine';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

export default function ATR() {
  const [topAssets, setTopAssets] = useState([
    { asset: '', atr: null },
    { asset: '', atr: null },
    { asset: '', atr: null },
    { asset: '', atr: null },
    { asset: '', atr: null },
  ]);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('primebias_top_assets');
    if (saved) {
      setTopAssets(JSON.parse(saved));
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem('primebias_top_assets', JSON.stringify(topAssets));
    window.dispatchEvent(new Event('atrUpdated'));
  }, [topAssets]);

  const handleReset = () => {
    setTopAssets([
      { asset: '', atr: null },
      { asset: '', atr: null },
      { asset: '', atr: null },
      { asset: '', atr: null },
      { asset: '', atr: null },
    ]);
    toast.success('ATR overrides cleared');
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-lg font-bold tracking-tight">ATR Settings</h1>
        <Button variant="ghost" size="icon" onClick={handleReset} className="h-9 w-9">
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground px-1">
        Set custom ATR values for your top 5 traded assets. These will override default values when calculating targets.
      </p>

      {/* Top 5 Assets with ATR Overrides */}
      <div className="space-y-3 bg-secondary/50 rounded-lg p-3 border border-border">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top 5 Assets</div>
        <div className="space-y-2">
          {topAssets.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-end">
              <Select value={item.asset || ''} onValueChange={(val) => {
                const newTop = [...topAssets];
                newTop[idx].asset = val;
                setTopAssets(newTop);
              }}>
                <SelectTrigger className="flex-1 h-9 text-sm">
                  <SelectValue placeholder={`Position ${idx + 1}`} />
                </SelectTrigger>
                <SelectContent className="max-h-48">
                  {ASSETS.map(a => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                step="0.00001"
                placeholder="ATR"
                value={item.atr || ''}
                onChange={(e) => {
                  const newTop = [...topAssets];
                  newTop[idx].atr = e.target.value ? parseFloat(e.target.value) : null;
                  setTopAssets(newTop);
                }}
                className="w-28 h-9 text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="text-xs text-muted-foreground bg-accent/20 rounded-lg p-3 border border-border space-y-1">
        <div className="font-semibold">How ATR is used:</div>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Target = (ATR ÷ 9) × grade weight</li>
          <li>Grade weights: A (1.25), B (1.0), C (1.5), D (3.0)</li>
          <li>Custom values override base ATR for selected assets</li>
        </ul>
      </div>
    </div>
  );
}