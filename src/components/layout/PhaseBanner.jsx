import React from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck, Flag } from 'lucide-react';
import { useStudio } from '../../engine/StudioContext.jsx';
import { PHASES } from '../../project/phases.js';
import CoachPanel from './CoachPanel.jsx';

/** Guided-mode context strip above a module: which phase this module serves. */
export default function PhaseBanner({ moduleId }) {
  const state = useStudio();
  if (state.meta.mode !== 'guided') return null;
  const phase = PHASES.find((p) => p.moduleId === moduleId);
  if (!phase) return null;
  const result = state.project.phases[phase.id];
  const passed = result?.status === 'passed';

  return (
    <>
      <div className={`mb-4 flex items-center gap-3 rounded-xl border px-4 py-2.5 text-xs ${
        passed ? 'border-emerald-900/60 bg-emerald-950/20' : 'border-violet-800/60 bg-violet-950/20'
      }`}>
        {passed ? <CircleCheck className="h-4 w-4 shrink-0 text-emerald-400" /> : <Flag className="h-4 w-4 shrink-0 text-violet-400" />}
        <span className="font-semibold text-slate-200">Phase {phase.id}: {phase.title}</span>
        <span className="chip bg-plant-800 text-slate-400">{phase.req}</span>
        <span className={passed ? 'text-emerald-400' : 'text-slate-500'}>
          {passed ? 'Accepted' : 'In progress — configure here, then check acceptance on Project Home'}
        </span>
        <Link to="/project" className="ml-auto shrink-0 font-semibold text-violet-400 hover:text-violet-300">
          Project Home →
        </Link>
      </div>
      <CoachPanel phaseId={phase.id} />
    </>
  );
}
