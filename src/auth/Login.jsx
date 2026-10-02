import React, { useState } from 'react';
import { Wrench, LogIn } from 'lucide-react';
import { login } from './session.js';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (login(username, password)) {
      onLogin();
    } else {
      setError('Invalid credentials. Hint: username is "mes".');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-plant-950 p-4">
      <div className="w-full max-w-sm">
        <div className="panel p-8">
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700">
              <Wrench className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">ForgeMES Studio</h1>
            <p className="mt-1 text-sm text-slate-400">Helvion Industrial Software · R2026.2</p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-widest text-violet-400">Pharma Edition</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">USERNAME</label>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username" autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">PASSWORD</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" />
            </div>
            {error && (
              <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</div>
            )}
            <button type="submit" className="btn-primary w-full">
              <LogIn className="h-4 w-4" /> Sign in to Studio
            </button>
          </form>
          <p className="mt-6 text-center text-[11px] text-slate-500">
            You are the implementation consultant for Helvion Pharma, Plant 2 Lakeworth. The platform is
            installed — now configure it.
          </p>
        </div>
      </div>
    </div>
  );
}
