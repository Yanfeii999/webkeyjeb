import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Anti-inspect & anti-view-source shortcuts
(function initClientGuard() {
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('[data-allow-copy="true"]')) {
      e.preventDefault();
    }
  });
  document.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) ||
      (e.ctrlKey && (k === 'u' || k === 's'))
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
})();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
