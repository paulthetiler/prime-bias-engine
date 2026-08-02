import { Toaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Suspense, lazy } from 'react';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import Login from '@/components/Login';

// AppLayout stays eager — it's the shell rendered on every authenticated route.
import AppLayout from '@/components/layout/AppLayout';

// Route pages are code-split: each becomes its own chunk fetched on first
// navigation. This keeps page-only dependencies out of the initial bundle —
// most notably Recharts + d3 (Journal / Stats only), which no longer load on
// the Login or Dashboard landing.
const Dashboard    = lazy(() => import('@/pages/Dashboard.jsx'));
const Input        = lazy(() => import('@/pages/Input'));
const Engine       = lazy(() => import('@/pages/Engine'));
const History      = lazy(() => import('@/pages/History'));
const TradeHistory = lazy(() => import('@/pages/TradeHistory.jsx'));
const Journal      = lazy(() => import('@/pages/Journal.jsx'));
const JournalStats = lazy(() => import('@/pages/JournalStats.jsx'));
const ATR          = lazy(() => import('@/pages/ATR'));
const Settings     = lazy(() => import('@/pages/Settings.jsx'));
const EngineTest   = lazy(() => import('@/pages/EngineTest.jsx'));

// Shown briefly while a route chunk loads. Mirrors the auth-loading spinner.
const RouteFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
  </div>
);


const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated, authError } = useAuth();

  if (authError?.type === 'not_configured') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center">
          <div className="text-4xl mb-4">⚙️</div>
          <h2 className="text-lg font-bold mb-2">Supabase not configured</h2>
          <p className="text-sm text-muted-foreground mb-4">{authError.message}</p>
          <p className="text-xs text-muted-foreground">
            Copy <code className="font-mono">.env.example</code> to{' '}
            <code className="font-mono">.env</code>, fill in your project URL and anon key,
            then restart the dev server. See <code className="font-mono">README.md</code>.
          </p>
        </div>
      </div>
    );
  }

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <AnimatePresence mode="wait">
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/input" element={<Input />} />
            <Route path="/engine" element={<Engine />} />
            <Route path="/history" element={<History />} />
            <Route path="/trade-history" element={<TradeHistory />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/journal/stats" element={<JournalStats />} />

            <Route path="/atr" element={<ATR />} />
            <Route path="/settings" element={<Settings />} />


          </Route>
          <Route path="/admin/engine-test" element={<EngineTest />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </AnimatePresence>
    </Suspense>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App