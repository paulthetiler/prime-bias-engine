import React, { useState } from 'react';
import { Download, Share, Plus, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInstallPrompt } from '@/lib/pwaInstall';

const DISMISS_KEY = 'primebias_install_dismissed';

// iOS manual instructions (no install event on Safari)
function IosSteps() {
  return (
    <div className="text-xs text-muted-foreground space-y-1">
      <div className="flex items-center gap-1.5">
        Tap <Share className="w-3.5 h-3.5 inline" /> Share, then
      </div>
      <div className="flex items-center gap-1.5">
        <Plus className="w-3.5 h-3.5 inline" /> "Add to Home Screen".
      </div>
    </div>
  );
}

// Full card for the Settings page.
export function InstallCard() {
  const { canInstall, installed, ios, promptInstall } = useInstallPrompt();

  if (installed) {
    return (
      <div className="border border-border rounded-xl p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Install App</div>
          <div className="text-xs text-muted-foreground">Running as an installed app</div>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4" /> Installed
        </span>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">Install App</div>
        <div className="text-xs text-muted-foreground">Add to your home screen for a full-screen, offline-ready app</div>
        {ios && !canInstall && <div className="mt-2"><IosSteps /></div>}
      </div>
      {canInstall ? (
        <Button size="sm" className="gap-2 shrink-0" onClick={promptInstall}>
          <Download className="w-4 h-4" /> Install
        </Button>
      ) : !ios ? (
        <span className="text-[11px] text-muted-foreground text-right shrink-0 max-w-[130px]">
          Use your browser menu → "Install app"
        </span>
      ) : null}
    </div>
  );
}

// Slim dismissible banner for the top of the dashboard.
export function InstallBanner() {
  const { canInstall, installed, ios, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [showIos, setShowIos] = useState(false);

  if (installed || dismissed || (!canInstall && !ios)) return null;

  const dismiss = () => { localStorage.setItem(DISMISS_KEY, '1'); setDismissed(true); };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
          <Download className="w-4.5 h-4.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Install PrimeBias</div>
          <div className="text-[11px] text-muted-foreground">Add to home screen — faster, full-screen, works offline.</div>
        </div>
        {canInstall ? (
          <Button size="sm" className="shrink-0" onClick={promptInstall}>Install</Button>
        ) : (
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => setShowIos(v => !v)}>How</Button>
        )}
        <button onClick={dismiss} className="p-1 rounded-lg text-muted-foreground hover:bg-secondary shrink-0" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
      {ios && showIos && (
        <div className="mt-2 pl-12"><IosSteps /></div>
      )}
    </div>
  );
}
