import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/lib/pwaInstall' // attach install-prompt listener early

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

// Register the service worker (enables install + offline). Best-effort.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
