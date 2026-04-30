import React, { useState, useEffect } from 'react';
import { ASSETS } from '@/lib/biasEngine';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RotateCcw, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

export default function ATR() {
  const [topAssets, setTopAssets] = useState(() => {
    const saved = localStorage.getItem('primebias_top_assets');
    if (saved) return JSON.parse(saved);
    return [
      { asset: '', atr: null },
      { asset: '', atr: null },
      { asset: '', atr: null },
      { asset: '', atr: null },
      { asset: '', atr: null },
    ];
  });

  const [extraAssets, setExtraAssets] = useState(() => {
    const saved = localStorage.getItem('primebias_extra_assets');
    return saved ? JSON.parse(saved) : [];
  });

  const [searches, setSearches] = useState({});
  const [openDropdowns, setOpenDropdowns] = useState({});

  // Save top assets to localStorage on change
  useEffect(() => {
    localStorage.setItem('primebias_top_assets', JSON.stringify(topAssets));
    window.dispatchEvent(new Event('atrUpdated'));
  }, [topAssets]);

  // Save extra assets to localStorage on change
  useEffect(() => {
    localStorage.setItem('primebias_extra_assets', JSON.stringify(extraAssets));
    window.dispatchEvent(new Event('atrUpdated'));
  }, [extraAssets]);

  const handleReset = () => {
    setTopAssets([
      { asset: '', atr: null },
      { asset: '', atr: null },
      { asset: '', atr: null },
      { asset: '', atr: null },
      { asset: '', atr: null },
    ]);
    setExtraAssets([]);
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
          {topAssets.map((item, idx) => {
            const search = searches[`top-${idx}`] || '';
            const filtered = ASSETS.filter(a => a.toLowerCase().includes(search.toLowerCase()));
            return (
              <div key={idx} className="flex gap-2 items-end">
                <div className="flex-1 relative">
                  <Input
                    type="text"
                    placeholder={`Position ${idx + 1}`}
                    value={item.asset || ''}
                    onChange={(e) => {
                      setSearches(s => ({ ...s, [`top-${idx}`]: e.target.value }));
                    }}
                    onFocus={() => setOpenDropdowns(o => ({ ...o, [`top-${idx}`]: true }))}
                    className="h-9 text-sm"
                  />
                  {item.asset && (
                    <button
                      onClick={() => {
                        const newTop = [...topAssets];
                        newTop[idx].asset = '';
                        setTopAssets(newTop);
                        setSearches(s => ({ ...s, [`top-${idx}`]: '' }));
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {openDropdowns[`top-${idx}`] && filtered.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                      {filtered.map(a => (
                        <button
                          key={a}
                          onClick={() => {
                            const newTop = [...topAssets];
                            newTop[idx].asset = a;
                            setTopAssets(newTop);
                            setSearches(s => ({ ...s, [`top-${idx}`]: '' }));
                            setOpenDropdowns(o => ({ ...o, [`top-${idx}`]: false }));
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
            );
          })}
        </div>
      </div>

      {/* Extra Assets */}
      <div className="space-y-3 bg-secondary/50 rounded-lg p-3 border border-border">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Additional Assets</div>
        {extraAssets.length > 0 && (
          <div className="space-y-2">
            {extraAssets.map((item, idx) => {
              const search = searches[`extra-${idx}`] || '';
              const filtered = ASSETS.filter(a => a.toLowerCase().includes(search.toLowerCase()));
              return (
                <div key={idx} className="flex gap-2 items-end">
                  <div className="flex-1 relative">
                    <Input
                      type="text"
                      placeholder="Asset"
                      value={item.asset || ''}
                      onChange={(e) => {
                        setSearches(s => ({ ...s, [`extra-${idx}`]: e.target.value }));
                      }}
                      onFocus={() => setOpenDropdowns(o => ({ ...o, [`extra-${idx}`]: true }))}
                      className="h-9 text-sm"
                    />
                    {item.asset && (
                      <button
                        onClick={() => {
                          const updated = [...extraAssets];
                          updated[idx].asset = '';
                          setExtraAssets(updated);
                          setSearches(s => ({ ...s, [`extra-${idx}`]: '' }));
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {openDropdowns[`extra-${idx}`] && filtered.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                        {filtered.map(a => (
                          <button
                            key={a}
                            onClick={() => {
                              const updated = [...extraAssets];
                              updated[idx].asset = a;
                              setExtraAssets(updated);
                              setSearches(s => ({ ...s, [`extra-${idx}`]: '' }));
                              setOpenDropdowns(o => ({ ...o, [`extra-${idx}`]: false }));
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                          >
                            {a}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Input
                    type="number"
                    step="0.00001"
                    placeholder="ATR"
                    value={item.atr || ''}
                    onChange={(e) => {
                      const updated = [...extraAssets];
                      updated[idx].atr = e.target.value ? parseFloat(e.target.value) : null;
                      setExtraAssets(updated);
                    }}
                    className="w-28 h-9 text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive shrink-0"
                    onClick={() => setExtraAssets(prev => prev.filter((_, i) => i !== idx))}
                  >
                    ×
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => setExtraAssets(prev => [...prev, { asset: '', atr: null }])}
        >
          <Plus className="w-4 h-4" /> Add New
        </Button>
      </div>

      {/* Info */}
      <div className="text-xs text-muted-foreground bg-accent/20 rounded-lg p-3 border border-border space-y-1">
        <div className="font-semibold">How ATR is used:</div>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Target = (ATR ÷ 9) × grade weight</li>
          <li>Grade weights: A (1.25), B (1.0), C (0.75), D (0.5)</li>
          <li>Custom values override base ATR for selected assets</li>
        </ul>
      </div>
    </div>
  );
}