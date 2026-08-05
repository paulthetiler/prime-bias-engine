import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Plus } from 'lucide-react';

export default function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isOnDashboard = location.pathname === '/';
  const isOnBiasTool = location.pathname === '/input';

  useEffect(() => {
    if (!isOnBiasTool) return undefined;

    const selector = document.querySelector('button[role="combobox"]');
    const selectorRow = selector?.parentElement;
    if (!selectorRow) return undefined;

    selectorRow.style.display = 'none';
    return () => {
      selectorRow.style.display = '';
    };
  }, [isOnBiasTool]);

  const openInstrumentPicker = () => {
    const openPicker = () => {
      const selector = document.querySelector('button[role="combobox"]');
      if (selector instanceof HTMLElement) selector.click();
    };

    if (!isOnBiasTool) {
      navigate('/input');
      window.setTimeout(openPicker, 100);
      return;
    }

    openPicker();
  };
  
  return (
    <div className="sticky top-0 z-40 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm" style={{ paddingTop: `calc(0.75rem + var(--safe-area-top))` }}>
      <div className="flex items-center gap-3 max-w-lg mx-auto">
        {!isOnDashboard && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-9 w-9 shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
        )}
        <Link to="/">
          <Button
            variant={isOnDashboard ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
          >
            Summary
          </Button>
        </Link>
        <Link to="/input">
          <Button
            variant={isOnBiasTool ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
          >
            Bias Tool
          </Button>
        </Link>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openInstrumentPicker}
          className="rounded-full ml-auto gap-1.5 whitespace-nowrap"
          aria-label="Add instrument"
        >
          <Plus className="w-4 h-4" />
          Add Instrument
        </Button>
      </div>
    </div>
  );
}