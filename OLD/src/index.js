import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

// Suppress ResizeObserver loop errors (harmless React warning)
const resizeObserverLoopErrRe = /^[^(ResizeObserver loop limit exceeded|ResizeObserver loop completed)]/;
const originalError = console.error;
console.error = (...args) => {
  const errorMessage = args[0]?.toString() || '';
  if (errorMessage.includes('ResizeObserver loop')) {
    return; // Suppress this specific error
  }
  originalError.call(console, ...args);
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA disabled - unregister any existing service workers to clear cached content
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (let registration of registrations) {
        registration.unregister().then(() => {
          console.log('[PWA] Service Worker unregistered:', registration.scope);
        });
      }
    });
    // Also clear caches
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => {
          caches.delete(name);
          console.log('[PWA] Cache deleted:', name);
        });
      });
    }
  });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
