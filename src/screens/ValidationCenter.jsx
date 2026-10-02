import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, CircleAlert, TriangleAlert, CircleCheck } from 'lucide-react';
import { useStudio } from '../engine/StudioContext.jsx';
import { validateConfig, findingCounts } from '../engine/validate.js';
import { MODULES, moduleById } from '../modules/registry.js';

export default function ValidationCenter() {
  const state = useStudio();
  const [showAll, setShowAll] = useState(false);
  const findings = useMemo(() => validateConfig(state.config), [state.config]);

  // Guided mode defaults to showing only the phases the trainee has reached —
  // findings from locked modules are noise until those modules open.
  const scopedMode = state.meta.mode === 'guided' && !state.ui.instructorMode;
  const cur = state.project.currentPhase ?? 0;
  const inScope = (f) => (moduleById(f.moduleId)?.phase ?? 0) <= cur;
  const visible = scopedMode && !showAll ? findings.filter(inScope) : findings;
  const hiddenCount = scopedMode ? findings.length - findings.filter(inScope).length : 0;
  const { errors, warnings } = findingCounts(visible);

  const byModule = MODULES.map((m) => ({
    module: m,
    items: visible.filter((f) => f.moduleId === m.id),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="panel flex items-center gap-4 p-5">
        <ClipboardCheck className="h-8 w-8 text-violet-400" />
        <div className="flex-1">
          <h1 className="text-lg font-bold text-white">Validation Center</h1>
          <p className="text-xs text-slate-500">
            The platform's configuration check. Errors block deployment; warnings deploy — and show up as
            consequences in the run.
          </p>
          {scopedMode && hiddenCount > 0 && (
            <p className="mt-1 text-[11px] text-slate-600">
              {showAll
                ? `Showing everything, including ${hiddenCount} finding${hiddenCount === 1 ? '' : 's'} from locked modules.`
                : `Future phases hidden — ${hiddenCount} finding${hiddenCount === 1 ? '' : 's'} in modules you have not reached yet.`}{' '}
              <button onClick={() => setShowAll((v) => !v)} className="font-semibold text-violet-400 hover:text-violet-300">
                {showAll ? 'Hide future phases' : 'Show all'}
              </button>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <span className={`chip ${errors > 0 ? 'bg-red-900/60 text-red-300' : 'bg-plant-800 text-slate-500'}`}>
            <CircleAlert className="h-3 w-3" /> {errors} errors
          </span>
          <span className={`chip ${warnings > 0 ? 'bg-amber-900/60 text-amber-300' : 'bg-plant-800 text-slate-500'}`}>
            <TriangleAlert className="h-3 w-3" /> {warnings} warnings
          </span>
        </div>
      </div>

      {visible.length === 0 && (
        <div className="panel flex items-center gap-3 p-6">
          <CircleCheck className="h-6 w-6 text-emerald-400" />
          <p className="text-sm text-emerald-300">
            {hiddenCount > 0
              ? 'Everything you have reached so far is clean.'
              : 'Configuration is clean. Deploy & Run when ready.'}
          </p>
        </div>
      )}

      {byModule.map(({ module, items }) => {
        const Icon = module.icon;
        return (
          <div key={module.id} className="panel p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-violet-400" />
                <span className="text-sm font-bold text-white">{module.title}</span>
                <span className="text-[11px] text-slate-600">({items.length})</span>
              </div>
              <Link to={`/studio/${module.id}`} className="text-xs font-semibold text-violet-400 hover:text-violet-300">
                Open module →
              </Link>
            </div>
            <ul className="space-y-2">
              {items.map((f) => (
                <li key={f.id} className="flex items-start gap-2 text-xs leading-snug">
                  {f.level === 'error'
                    ? <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                    : <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />}
                  <span className={f.level === 'error' ? 'text-red-300' : 'text-amber-200/90'}>{f.msg}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
