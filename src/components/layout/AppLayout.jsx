import React from 'react';
import { Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import TopNav from './TopNav';
import BottomNav from './BottomNav';
import PageTransition from './PageTransition';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNav />
      <main className="flex-1 pb-20 max-w-lg mx-auto w-full overflow-hidden">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <BottomNav />
    </div>
  );
}