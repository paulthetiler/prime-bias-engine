import { Toaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import Login from '@/components/Login';

import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard.jsx';
import Input from '@/pages/Input';
import Engine from '@/pages/Engine';
import History from '@/pages/History';
import TradeHistory from '@/pages/TradeHistory.jsx';
import Journal from '@/pages/Journal.jsx';

import ATR from '@/pages/ATR';
import Settings from '@/pages/Settings.jsx';
import EngineTest from '@/pages/EngineTest.jsx';


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
    <AnimatePresence mode="wait">
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/input" element={<Input />} />
          <Route path="/engine" element={<Engine />} />
          <Route path="/history" element={<History />} />
          <Route path="/trade-history" element={<TradeHistory />} />
          <Route path="/journal" element={<Journal />} />

          <Route path="/atr" element={<ATR />} />
          <Route path="/settings" element={<Settings />} />


        </Route>
        <Route path="/admin/engine-test" element={<EngineTest />} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </AnimatePresence>
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