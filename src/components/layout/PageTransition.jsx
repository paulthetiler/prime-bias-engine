import React from 'react';

// Route content must never be held in an exit/wait animation state. Rapidly
// switching between Summary and Bias Tool could interrupt Framer Motion's
// nested AnimatePresence transition and leave the outlet empty until refresh.
// Keep this wrapper deliberately static so navigation is immediate and reliable.
export default function PageTransition({ children }) {
  return <div>{children}</div>;
}
