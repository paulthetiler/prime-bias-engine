// PWA install helper. Captures the (Android/Chrome) install prompt and exposes
// a hook so any component can offer an "Install app" button. iOS has no prompt
// event, so we detect it and show manual instructions instead.
import { useState, useEffect } from 'react';

let deferredPrompt = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new Event('pwaInstallable'));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new Event('pwaInstalled'));
  });
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(!!deferredPrompt);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onInstallable = () => setCanInstall(!!deferredPrompt);
    const onInstalled = () => { setCanInstall(false); setInstalled(true); };
    window.addEventListener('pwaInstallable', onInstallable);
    window.addEventListener('pwaInstalled', onInstalled);
    return () => {
      window.removeEventListener('pwaInstallable', onInstallable);
      window.removeEventListener('pwaInstalled', onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    setCanInstall(false);
    return choice?.outcome === 'accepted';
  };

  return { canInstall, installed, ios: isIOS(), promptInstall };
}
