import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, ChevronRight, CircleCheck, Lock, Play, Star, ClipboardCheck, PenLine, Printer, RotateCcw,
} from 'lucide-react';
import { useStudio, useStudioDispatch } from '../engine/StudioContext.jsx';
import { patchProject, resetWorkspace } from '../engine/actions.js';
import { MODULES, moduleById } from '../modules/registry.js';
import { PHASES, checkPhase } from '../project/phases.js';
import { executeRun } from '../engine/execution.js';
import { gradeFor, totalStars, maxStars } from '../project/scoring.js';
import Modal from '../components/feedback/Modal.jsx';
import ESignature from '../components/interact/ESignature.jsx';
import CoachPanel from '../components/layout/CoachPanel.jsx';
import { CUSTOMER } from '../data/customer.js';

function Stars({ n }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3].map((i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= n ? 'fill-amber-400 text-amber-400' : 'text-slate-700'}`} />
      ))}
    </span>
  );
}

export default function ProjectHome() {
  const state = useStudio();
  const dispatch = useStudioDispatch();
  const guided = state.meta.mode === 'guided';
  const project = state.project;
  const current = project.currentPhase ?? 0;
  const [signOpen, setSignOpen] = useState(false);
  const [goLive, setGoLive] = useState(null); // { run, checks, grade }
  const [confirmReset, setConfirmReset] = useState(false);

  const runCheck = (phaseId) => {
    const { checks, passed, stars } = checkPhase(state.config, phaseId);
    dispatch(patchProject({
      phases: { ...project.phases, [phaseId]: { status: passed ? 'passed' : 'failed', stars, checks, checkedAt: Date.now() } },
      currentPhase: passed ? Math.max(current, phaseId + 1) : current,
    }));
  };

  const acceptEngagement = () => {
    dispatch(patchProject({
      phases: { ...project.phases, 0: { status: 'passed', stars: 3, checks: [], checkedAt: Date.now() } },
      currentPhase: Math.max(current, 1),
    }));
  };

  const runGoLive = () => {
    const { checks, passed, stars } = checkPhase(state.config, 9);
    const run = executeRun(state.config);
    const grade = gradeFor(checks, { ...project, phases: { ...project.phases, 9: { stars } } });
    setGoLive({ run, checks, passed, stars, grade });
    if (passed) setSignOpen(true);
    dispatch(patchProject({
      phases: { ...project.phases, 9: { status: passed ? 'passed' : 'failed', stars, checks, checkedAt: Date.now() } },
    }));
  };

  const sign = ({ initials }) => {
    dispatch(patchProject({ signoffs: [...project.signoffs, { phaseId: 9, initials, at: Date.now() }] }));
    setSignOpen(false);
  };

  const signoff = project.signoffs.find((s) => s.phaseId === 9);

  return (
    <div className="space-y-5">
      <div className="panel flex items-start gap-4 p-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700">
          <Building2 className="h-6 w-6 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="panel-title">Customer engagement</div>
          <h1 className="mt-1 text-xl font-bold text-white">{CUSTOMER.name} — {CUSTOMER.plant}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            You are the implementation consultant from {CUSTOMER.consultantOrg}. The ForgeMES platform is
            installed — configure it, prove it on a full production day, and take the plant live.
          </p>
        </div>
        {guided && (
          <div className="shrink-0 text-right">
            <div className="mono text-2xl font-bold text-amber-400">{totalStars(project)}<span className="text-sm text-slate-600">/{maxStars()}</span></div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">stars</div>
            <button
              onClick={() => setConfirmReset(true)}
              title="Wipe the configuration and all progress and start the deployment again"
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"
            >
              <RotateCcw className="h-3 w-3" /> Start fresh
            </button>
          </div>
        )}
      </div>

      {!guided && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m) => {
            const Icon = m.icon;
            return (
              <Link key={m.id} to={`/studio/${m.id}`} className="panel group p-4 transition-colors hover:border-violet-700">
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-violet-400" />
                  <ChevronRight className="h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="mt-3 text-sm font-semibold text-white">{m.title}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{m.tagline}</div>
              </Link>
            );
          })}
        </div>
      )}

      {guided && (
        <div className="space-y-2">
          {PHASES.map((phase) => {
            const result = project.phases[phase.id];
            const passed = result?.status === 'passed';
            const isCurrent = phase.id === current || (phase.id === 9 && current >= 9);
            const locked = phase.id > current;
            const mod = phase.moduleId ? moduleById(phase.moduleId) : null;

            return (
              <div key={phase.id} className={`panel p-4 ${isCurrent && !passed ? 'border-violet-700/70' : ''} ${locked ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-3">
                  {passed ? <CircleCheck className="h-5 w-5 shrink-0 text-emerald-400" />
                    : locked ? <Lock className="h-5 w-5 shrink-0 text-slate-600" />
                    : <Play className="h-5 w-5 shrink-0 text-violet-400" />}
                  <span className="mono w-8 text-xs text-slate-600">P{phase.id}</span>
                  <span className="text-sm font-semibold text-white">{phase.title}</span>
                  <span className="chip bg-plant-800 text-slate-400">{phase.req}</span>
                  {result && <Stars n={result.stars} />}
                  <span className="ml-auto" />
                  {mod && !locked && (
                    <Link to={`/studio/${mod.id}`} className="text-xs font-semibold text-violet-400 hover:text-violet-300">
                      Open {mod.title} →
                    </Link>
                  )}
                </div>

                {!locked && (isCurrent || (!passed && result)) && (
                  <div className="mt-3 border-t border-slate-800 pt-3">
                    <p className="max-w-3xl text-xs italic leading-relaxed text-slate-400">{phase.brief}</p>

                    <div className="mt-3">
                      <CoachPanel phaseId={phase.id} />
                    </div>

                    {result?.checks?.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {result.checks.map((c, i) => (
                          <li key={i} className={`text-xs ${c.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                            <div className="flex items-start gap-2">
                              {c.ok ? '✓' : '✗'} <span className={c.ok ? 'text-slate-400' : 'text-red-300'}>{c.label}</span>
                            </div>
                            {!c.ok && c.help?.hint && (
                              <div className="ml-5 mt-0.5 max-w-2xl text-[11px] font-normal leading-snug text-amber-300/90">
                                {c.help.hint}{' '}
                                {c.help.moduleId && (
                                  <Link
                                    to={`/studio/${c.help.moduleId}${c.help.tab ? `?tab=${c.help.tab}` : ''}`}
                                    className="font-semibold text-violet-400 hover:text-violet-300"
                                  >
                                    Open →
                                  </Link>
                                )}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-3 flex gap-2">
                      {phase.id === 0 && !passed && (
                        <button onClick={acceptEngagement} className="btn-primary !py-1.5 text-xs">Accept the engagement</button>
                      )}
                      {phase.id > 0 && phase.id < 9 && (
                        <button onClick={() => runCheck(phase.id)} className="btn-primary !py-1.5 text-xs">
                          <ClipboardCheck className="h-3.5 w-3.5" /> Check acceptance
                        </button>
                      )}
                      {phase.id === 9 && current >= 9 && (
                        <button onClick={runGoLive} className="btn-primary !py-1.5 text-xs">
                          <Play className="h-3.5 w-3.5" /> Run the go-live day
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

      {guided && goLive && (
        <GoLiveReport state={state} goLive={goLive} signoff={signoff} />
      )}

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Start fresh?">
        <p className="mb-4 text-sm text-slate-300">
          This wipes the whole configuration and all project progress and starts the deployment again from
          Phase 0. There is no undo — use Export / Import first if you want to keep this attempt.
        </p>
        <div className="flex gap-2">
          <button onClick={() => setConfirmReset(false)} className="btn-ghost flex-1">Cancel</button>
          <button
            onClick={() => { dispatch(resetWorkspace(state.meta.mode)); setConfirmReset(false); }}
            className="btn-danger flex-1"
          >
            Yes, start fresh
          </button>
        </div>
      </Modal>

      <Modal open={signOpen} onClose={() => setSignOpen(false)} title="Customer acceptance — go-live protocol">
        <ESignature
          prompt="Helvion Pharma accepts the configuration based on the go-live run results. Sign the acceptance protocol as the responsible consultant (Annex 11 / Part 11 e-signature)."
          confirmLabel="Sign acceptance"
          onSign={sign}
          onCancel={() => setSignOpen(false)}
        />
      </Modal>
    </div>
  );
}

function GoLiveReport({ state, goLive, signoff }) {
  const k = goLive.run.kpis;
  const pct = (v) => `${Math.round(v * 100)}%`;
  return (
    <div className="print-area panel space-y-4 p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="panel-title">Go-live acceptance report</div>
          <h2 className="mt-1 text-lg font-bold text-white">{CUSTOMER.name} · {CUSTOMER.plant}</h2>
          <p className="text-xs text-slate-500">
            Consultant: {state.meta.traineeName || '—'} ({CUSTOMER.consultantOrg}) · Config {state.meta.configId} · {new Date().toLocaleDateString()}
          </p>
        </div>
        <div className="text-right">
          <div className={`mono text-4xl font-bold ${goLive.grade.startsWith('A') ? 'text-emerald-400' : goLive.grade === 'B' ? 'text-amber-400' : 'text-red-400'}`}>
            {goLive.grade}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">deployment grade</div>
        </div>
      </div>

      <table className="w-full text-left text-xs">
        <tbody>
          {[
            ['Cases produced', `${k.producedCases} of ${k.plannedCases} (${k.heldCases} on hold)`],
            ['Cases shipped', k.shippedCases],
            ['Schedule adherence (Cadence APS plan)', pct(k.scheduleAdherence)],
            ['First pass yield', k.fpy != null ? pct(k.fpy) : '—'],
            ['Line OEE (avg)', k.oee != null ? pct(k.oee) : '—'],
            ['Changeover minutes (actual)', `${Math.round(k.changeoverActualMin)} min`],
            ['UI verify rate', k.uiVerifyRate != null ? pct(k.uiVerifyRate) : '—'],
            ['EU Hub events sent / failed', `${k.repositoryReported} / ${k.repositoryFailed}`],
            ['Defects escaped / shipped', `${k.defectsEscaped} / ${k.defectsShipped}`],
            ['OEE classification accuracy', pct(k.classificationAccuracy)],
            ['Data fidelity (recorded vs reality)', pct(k.dataFidelity)],
          ].map(([label, value]) => (
            <tr key={label} className="border-b border-slate-800/60 last:border-0">
              <td className="py-1.5 pr-4 text-slate-500">{label}</td>
              <td className="mono py-1.5 font-semibold text-slate-200">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="space-y-1">
        {goLive.checks.map((c, i) => (
          <li key={i} className={`text-xs ${c.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {c.ok ? '✓' : '✗'} {c.label}
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t border-slate-800 pt-3">
        {signoff ? (
          <p className="flex items-center gap-2 text-xs text-slate-400">
            <PenLine className="h-3.5 w-3.5 text-emerald-400" />
            Accepted by <span className="mono font-bold text-white">{signoff.initials}</span> on {new Date(signoff.at).toLocaleString()}
          </p>
        ) : (
          <p className="text-xs text-slate-600">Not yet signed.</p>
        )}
        <button onClick={() => window.print()} className="btn-ghost !py-1.5 text-xs">
          <Printer className="h-3.5 w-3.5" /> Print report
        </button>
      </div>
    </div>
  );
}
