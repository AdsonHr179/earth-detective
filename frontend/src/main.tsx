import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import SnapshotApp from './SnapshotApp';
import './tokens.css';
import './shell.css';
import './controls.css';
import './map.css';
import './result.css';
import './chart.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {import.meta.env.VITE_SNAPSHOT_MODE === '1' ? <SnapshotApp /> : <App />}
  </React.StrictMode>,
);
