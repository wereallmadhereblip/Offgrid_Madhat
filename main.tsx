import React from 'react';
import { createRoot } from 'react-dom/client';
import CommandCenter from './offgrid';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CommandCenter />
  </React.StrictMode>,
);