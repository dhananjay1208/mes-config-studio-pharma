import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GraduationCap, CircleCheck, ChevronDown, ChevronUp, Wand2, ArrowRight, ClipboardCheck,
} from 'lucide-react';
import { useStudio, useStudioDispatch } from '../../engine/StudioContext.jsx';
import { setConfig } from '../../engine/actions.js';
import { coachProgress } from '../../project/coach.js';
import { PHASES } from '../../project/phases.js';
import { moduleById } from '../../modules/registry.js';

/**
 * The coach — a live, step-by-step checklist for the phase. Steps tick
 * themselves as the configuration changes (same engine functions as
 * acceptance), "Take me there" deep-links to the module tab, and "Show me"
 * applies the reference value through the normal CONFIG_SET path and explains
 * what it set. Guided mode only; toggle in Settings.
 */
export default function CoachPanel({ phaseId }) {
  const state = useStudio();
  const dispatch = useStudioDispatch();
  const [collapsed, setCollapsed] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [explains, setExplains] = useState({});
  const prog = useMemo(() => coachProgress(state.config, phaseId), [state.config, phaseId]);

  if (state.meta.mode !== 'guided' || state.ui.coachEnabled === false || !prog) return null;

  const showMe = state.ui.coachShowMe !== false;
  const passed = state.project.phases?.[phaseId]?.status === 'passed';

  if (passed) {
    const next = PHASES.find((p) => p.id === phaseId + 1);
    if (!next) return null;
    const nextMod = next.moduleId ? moduleById(next.moduleId) : null;
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-900/60 bg-emerald-950/15 px-4 py-2.5 text-xs">
        <CircleCheck className="h-4 w-4 shrink-0 text-emerald-400" />
        <span className="text-slate-300">Phase {phaseId} accepted — next up: <span className="font-semibold text-white">Phase {next.id} · {next.title}</span></span>
        <Link to={nextMod ? `/studio/${nextMod.id}` : '/project'} className="ml-auto shrink-0 font-semibold text-violet-400 hover:text-violet-300">
          {nextMod ? `Open ${nextMod.title} →` : 'Go to Project Home →'}
        </Link>
      </div>
    );
  }

  const allDone = prog.doneCount === prog.total;
  const currentIdx = prog.firstOpenIndex;
  const expandedId = openId ?? (currentIdx >= 0 ? prog.steps[currentIdx].id : null);

  return (
    <div className="mb-4 rounded-xl border border-violet-700/50 bg-violet-950/15">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left"
      >
        <GraduationCap className="h-4 w-4 shrink-0 text-violet-400" />
        <span className="text-xs font-bold text-white">Coach</span>
        <span className="text-[11px] text-slate-400">
          {allDone ? `all ${prog.total} steps done` : `step ${prog.doneCount + 1} of ${prog.total}`}
        </span>
        <span className="ml-1 flex items-center gap-1">
          {prog.steps.map((s) => (
            <span key={s.id} className={`h-1.5 w-1.5 rounded-full ${s.done ? 'bg-emerald-400' : 'bg-slate-700'}`} />
          ))}
        </span>
        {collapsed
          ? <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-slate-500" />
          : <ChevronUp className="ml-auto h-4 w-4 shrink-0 text-slate-500" />}
      </button>

      {!collapsed && (
        <div className="space-y-1 border-t border-violet-900/40 px-4 py-3">
          {allDone && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-900/60 bg-emerald-950/20 px-3 py-2 text-xs">
              <ClipboardCheck className="h-4 w-4 shrink-0 text-emerald-400" />
              <span className="text-emerald-300">Every step is done — go to Project Home and press <b>Check acceptance</b>.</span>
              <Link to="/project" className="ml-auto shrink-0 font-semibold text-violet-400 hover:text-violet-300">Project Home →</Link>
            </div>
          )}

          {prog.steps.map((step, i) => {
            const expanded = expandedId === step.id && !step.done;
            const fix = expanded && showMe ? step.fix(state.config) : null;
            return (
              <div key={step.id} className={`rounded-lg ${expanded ? 'bg-plant-900/70 ring-1 ring-violet-800/60' : ''}`}>
                <button
                  onClick={() => setOpenId(step.id)}
                  className="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left"
                >
                  {step.done
                    ? <CircleCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                    : <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${i === currentIdx ? 'border-violet-500 text-violet-300' : 'border-slate-700 text-slate-600'}`}>{i + 1}</span>}
                  <span className={`text-xs ${step.done ? 'text-slate-500 line-through decoration-slate-700' : i === currentIdx ? 'font-semibold text-white' : 'text-slate-400'}`}>
                    {step.title}
                  </span>
                </button>

                {step.done && explains[step.id] && (
                  <p className="px-9 pb-2 text-[11px] leading-snug text-emerald-400/80">{explains[step.id]}</p>
                )}

                {expanded && (
                  <div className="space-y-2 px-9 pb-2.5">
                    <p className="text-[11px] leading-relaxed text-slate-300">{step.instruction}</p>
                    {step.hint && (
                      <p className="text-[11px] leading-snug text-amber-400/90">{step.hint}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <Link
                        to={`/studio/${prog.moduleId}?tab=${step.tab}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-violet-600/20 px-2.5 py-1 text-[11px] font-semibold text-violet-300 hover:bg-violet-600/30"
                      >
                        Take me there <ArrowRight className="h-3 w-3" />
                      </Link>
                      {fix && (
                        <button
                          onClick={() => {
                            for (const op of fix.ops) dispatch(setConfig(op.path, op.value));
                            setExplains((e) => ({ ...e, [step.id]: fix.explain }));
                            setOpenId(null);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-plant-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-white"
                          title="Apply the reference setting for this step and explain it"
                        >
                          <Wand2 className="h-3 w-3" /> Show me
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
