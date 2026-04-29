import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function TopNav() {
  const location = useLocation();
  
  return (
    <div className="sticky top-0 z-40 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 max-w-lg mx-auto">
        <Link to="/" asChild>
          <Button
            variant={location.pathname === '/' ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
          >
            Dashboard
          </Button>
        </Link>
        <Link to="/input" asChild>
          <Button
            variant={location.pathname === '/input' ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
          >
            Input
          </Button>
        </Link>
      </div>
    </div>
  );
}