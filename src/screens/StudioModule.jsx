import React, { Suspense } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useStudio } from '../engine/StudioContext.jsx';
import { moduleById, MODULE_COMPONENTS } from '../modules/registry.js';
import { moduleUnlocked } from '../project/phases.js';
import PhaseBanner from '../components/layout/PhaseBanner.jsx';

export default function StudioModule() {
  const { moduleId } = useParams();
  const state = useStudio();
  const mod = moduleById(moduleId);
  if (!mod) return <Navigate to="/project" replace />;

  const Component = MODULE_COMPONENTS[moduleId];
  const Icon = mod.icon;

  if (!moduleUnlocked(state, mod.phase)) {
    return (
      <div className="panel p-10 text-center">
        <Lock className="mx-auto mb-4 h-10 w-10 text-slate-600" />
        <h2 className="text-lg font-bold text-white">{mod.title} is locked</h2>
        <p className="mt-2 text-sm text-slate-400">
          This module opens at project phase {mod.phase}. Complete the earlier phases first — a real deployment
          is built in order for a reason.
        </p>
        <Link to="/project" className="btn-primary mt-6 inline-flex">Back to Project Home</Link>
      </div>
    );
  }

  return (
    <div>
      <PhaseBanner moduleId={moduleId} />
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-plant-800">
          <Icon className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">{mod.title}</h1>
          <p className="text-xs text-slate-500">{mod.tagline}</p>
        </div>
      </div>
      <Suspense fallback={<div className="panel p-10 text-center text-sm text-slate-500">Loading module…</div>}>
        <Component />
      </Suspense>
    </div>
  );
}
