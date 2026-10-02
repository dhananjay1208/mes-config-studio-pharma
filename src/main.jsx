import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { StudioProvider } from './engine/StudioContext.jsx';
import './index.css';

// HashRouter keeps deep links working even when the app is opened from a
// plain file host; netlify.toml still has the SPA redirect for clean hosts.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <StudioProvider>
        <App />
      </StudioProvider>
    </HashRouter>
  </React.StrictMode>
);
