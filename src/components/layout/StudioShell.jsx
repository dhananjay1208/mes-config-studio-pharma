import React, { useMemo } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Wrench, LayoutDashboard, Play, ClipboardCheck, ArrowLeftRight, Settings as SettingsIcon, LogOut, Rocket,
  CircleAlert, TriangleAlert, CircleCheck, BookOpenText, BookMarked,
} from 'lucide-react';
import { useStudio } from '../../engine/StudioContext.jsx';
import { validateConfig, findingCounts } from '../../engine/validate.js';
import { MODULES, moduleById } from '../../modules/registry.js';
import { moduleUnlocked } from '../../project/phases.js';
import { logout } from '../../auth/session.js';
import { Lock } from 'lucide-react';

function RailLink({ to, icon: Icon, children, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `rail-link ${isActive ? 'rail-link-active' : ''}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{children}</span>
    </NavLink>
  );
}

function RailSection({ label, children }) {
  return (
    <div className="mt-5">
      <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export default function StudioShell({ onLogout }) {
  const state = useStudio();
  const navigate = useNavigate();
  const { meta } = state;
  // In guided mode the chip counts only findings from modules the trainee has
  // reached — a fresh project otherwise opens on "14 ERR" that all belong to
  // phases they cannot even enter yet. Deploy gating still uses the FULL set.
  const scoped = meta.mode === 'guided' && !state.ui.instructorMode;
  const { errors, warnings } = useMemo(() => {
    const all = validateConfig(state.config);
    const cur = state.project.currentPhase ?? 0;
    const visible = scoped ? all.filter((f) => (moduleById(f.moduleId)?.phase ?? 0) <= cur) : all;
    return findingCounts(visible);
  }, [state.config, scoped, state.project.currentPhase]);

  const handleLogout = () => {
    logout();
    onLogout();
  };

  return (
    <div className="flex min-h-screen bg-plant-950">
      {/* Left rail */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-800 bg-plant-900">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700">
            <Wrench className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold leading-tight text-white">ForgeMES Studio</div>
            <div className="text-[10px] text-slate-500">Helvion Industrial · R2026.2 Pharma</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          <RailSection label="Project">
            <RailLink to="/project" icon={LayoutDashboard}>Project Home</RailLink>
          </RailSection>

          <RailSection label="Configure">
            {MODULES.map((m) => (
              moduleUnlocked(state, m.phase) ? (
                <RailLink key={m.id} to={`/studio/${m.id}`} icon={m.icon}>{m.title}</RailLink>
              ) : (
                <div key={m.id} className="rail-link cursor-not-allowed opacity-40" title={`Unlocks at project phase ${m.phase}`}>
                  <Lock className="h-4 w-4 shrink-0" />
                  <span className="truncate">{m.title}</span>
                </div>
              )
            ))}
          </RailSection>

          <RailSection label="Run">
            <RailLink to="/run" icon={Play}>Deploy &amp; Run</RailLink>
          </RailSection>

          <RailSection label="Tools">
            <RailLink to="/guide" icon={BookMarked}>User Guide</RailLink>
            <RailLink to="/validation" icon={ClipboardCheck}>Validation Center</RailLink>
            <RailLink to="/glossary" icon={BookOpenText}>Glossary</RailLink>
            <RailLink to="/exchange" icon={ArrowLeftRight}>Export / Import</RailLink>
            <RailLink to="/settings" icon={SettingsIcon}>Settings</RailLink>
          </RailSection>
        </nav>

        <button
          onClick={handleLogout}
          className="mx-2 mb-3 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-plant-800 hover:text-slate-300"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-800 bg-plant-900/95 px-5 py-3 backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{meta.configName}</div>
            <div className="text-[11px] text-slate-500">
              Helvion Pharma · Plant 2 Lakeworth{meta.traineeName ? ` · ${meta.traineeName}` : ''}
            </div>
          </div>
          <button onClick={() => navigate('/validation')}
            title={scoped ? 'Open Validation Center — findings in future phases hidden' : 'Open Validation Center'}
            className={`chip ${errors > 0 ? 'bg-red-900/60 text-red-300' : warnings > 0 ? 'bg-amber-900/60 text-amber-300' : 'bg-emerald-900/50 text-emerald-300'}`}>
            {errors > 0 ? <CircleAlert className="h-3 w-3" /> : warnings > 0 ? <TriangleAlert className="h-3 w-3" /> : <CircleCheck className="h-3 w-3" />}
            {errors > 0 ? `${errors} err` : ''}{errors > 0 && warnings > 0 ? ' · ' : ''}{warnings > 0 ? `${warnings} warn` : ''}{errors === 0 && warnings === 0 ? 'valid' : ''}
          </button>
          <span className={`chip ${meta.mode === 'guided' ? 'bg-violet-900/60 text-violet-300' : 'bg-slate-700/60 text-slate-300'}`}>
            {meta.mode === 'guided' ? 'Guided project' : 'Sandbox'}
          </span>
          {state.ui.instructorMode && (
            <span className="chip bg-amber-900/60 text-amber-300">Instructor</span>
          )}
          <button onClick={() => navigate('/run')} className="btn-primary !py-1.5 text-xs">
            <Rocket className="h-3.5 w-3.5" /> Deploy &amp; Run
          </button>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
