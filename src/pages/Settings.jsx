import { useState } from 'react';
import { useTheme } from '@/lib/useTheme';
import { Button } from '@/components/ui/button';
import { Moon, Sun, BookOpen } from 'lucide-react';
import HowToGuide from '@/components/HowToGuide';

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="p-4 space-y-6">
      <div className="pt-2">
        <h1 className="text-lg font-bold tracking-tight">Settings</h1>
      </div>

      <div className="space-y-4">
        <div className="border border-border rounded-lg p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold mb-1">Theme</h2>
            <p className="text-xs text-muted-foreground">Choose between light and dark mode</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            className="gap-2"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </Button>
        </div>

        <div className="border border-border rounded-lg p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold mb-1">Instructions for Use</h2>
            <p className="text-xs text-muted-foreground">Detailed guide on how to use the bias engine and all its features</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowGuide(true)}
            className="gap-2"
          >
            <BookOpen className="w-4 h-4" />
            Open Guide
          </Button>
        </div>
      </div>

      <HowToGuide open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  );
}