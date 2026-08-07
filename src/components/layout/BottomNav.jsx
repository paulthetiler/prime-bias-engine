import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { BarChart3, Timer, Settings, History, BookOpen, LineChart, Gauge } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/engine', icon: BarChart3, label: 'Engine' },
  { path: '/trade-history', icon: History, label: 'Trades' },
  { path: '/journal', icon: BookOpen, label: 'Journal' },
  { path: '/journal/stats', icon: LineChart, label: 'Stats' },
  { path: '/strength', icon: Gauge, label: 'Strength' },
  { path: '/atr', icon: Timer, label: 'ATR' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border select-none" style={{ paddingBottom: `calc(0.25rem + var(--safe-area-bottom))` }}>
      <div className="flex items-center justify-around max-w-lg mx-auto px-1 py-1">
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 px-2 rounded-lg transition-colors min-w-0',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className={cn('w-5 h-5', active && 'text-primary')} />
              <span className="text-[9px] font-medium">{item.label}</span>
            </Link>
          );
        })}

      </div>
    </nav>
  );
}