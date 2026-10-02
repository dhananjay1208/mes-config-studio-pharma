import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './auth/Login.jsx';
import { isLoggedIn } from './auth/session.js';
import StudioShell from './components/layout/StudioShell.jsx';
import ProjectHome from './screens/ProjectHome.jsx';
import StudioModule from './screens/StudioModule.jsx';
import ValidationCenter from './screens/ValidationCenter.jsx';
import Guide from './screens/Guide.jsx';
import Glossary from './screens/Glossary.jsx';
import ExportImport from './screens/ExportImport.jsx';
import Settings from './screens/Settings.jsx';
import DeployRun from './run/DeployRun.jsx';

export default function App() {
  const [authed, setAuthed] = useState(isLoggedIn());

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <Routes>
      <Route element={<StudioShell onLogout={() => setAuthed(false)} />}>
        <Route path="/" element={<Navigate to="/project" replace />} />
        <Route path="/project" element={<ProjectHome />} />
        <Route path="/studio/:moduleId" element={<StudioModule />} />
        <Route path="/run" element={<DeployRun />} />
        <Route path="/run/results/:view" element={<DeployRun />} />
        <Route path="/validation" element={<ValidationCenter />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/glossary" element={<Glossary />} />
        <Route path="/exchange" element={<ExportImport />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/project" replace />} />
      </Route>
    </Routes>
  );
}
