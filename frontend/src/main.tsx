import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './tokens.css';
import './shell.css';
import './controls.css';
import './map.css';
import './result.css';
import './chart.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
