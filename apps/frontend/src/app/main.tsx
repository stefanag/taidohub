import * as React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './styles/globals.css';
import 'flag-icons/css/flag-icons.min.css';
import '@/i18n';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element "#root" not found in index.html.');
}

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
