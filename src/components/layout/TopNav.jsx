import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

export default function TopNav() {
  const location = useLocation();
  
  return (
    <div className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="flex items-center gap-6 px-4 h-14">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-primary"></div>
          <span className="text-sm font-semibold">PrimeBias</span>
        </div>
        
        <div className="flex gap-4 flex-1">
          <Link
            to="/"
            className={cn(
              'text-sm font-medium transition-colors pb-3.5 border-b-2',
              location.pathname === '/' 
                ? 'border-primary text-foreground' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Dashboard
          </Link>
          <Link
            to="/input"
            className={cn(
              'text-sm font-medium transition-colors pb-3.5 border-b-2',
              location.pathname === '/input' 
                ? 'border-primary text-foreground' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Input
          </Link>
        </div>
      </div>
    </div>
  );
}