import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

export default function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isOnDashboard = location.pathname === '/';
  
  return (
    <div className="sticky top-0 z-40 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm" style={{ paddingTop: `calc(0.75rem + var(--safe-area-top))` }}>
      <div className="flex items-center gap-3 max-w-lg mx-auto">
        {!isOnDashboard && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-9 w-9"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
        )}
        <Link to="/">
          <Button
            variant={location.pathname === '/' ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
          >
            Summary
          </Button>
        </Link>
        <Link to="/input">
          <Button
            variant={location.pathname === '/input' ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
          >
            Bias Tool
          </Button>
        </Link>
      </div>
    </div>
  );
}