import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';

// Keep the service worker updated. The worker is network-only and clears old
// caches, preventing players from remaining on a stale frontend after deploys.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Reload once when a newly deployed worker takes control of this tab.
    if (sessionStorage.getItem('cg-sw-reloaded') !== '1') {
      sessionStorage.setItem('cg-sw-reloaded', '1');
      window.location.reload();
    }
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error) => console.warn('Service worker update check failed:', error));
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
