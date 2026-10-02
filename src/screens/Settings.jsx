import React, { useState } from 'react';
import { UserRound, GraduationCap, KeyRound, RotateCcw, Wand2 } from 'lucide-react';
import { useStudio, useStudioDispatch } from '../engine/StudioContext.jsx';
import { patchMeta, patchUi, setMode, resetWorkspace, importState } from '../engine/actions.js';
import { setPassword, INSTRUCTOR_PASSWORD } from '../auth/session.js';
import { buildModelAnswerConfig } from '../data/presets.js';
import Modal from '../components/feedback/Modal.jsx';

export default function Settings() {
  const state = useStudio();
  const dispatch = useStudioDispatch();

  const [instructorPw, setInstructorPw] = useState('');
  const [instructorErr, setInstructorErr] = useState('');
  const [newPw, setNewPw] = useState('');
  const [secCode, setSecCode] = useState('');
  const [pwMsg, setPwMsg] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const unlockInstructor = () => {
    if (instructorPw === INSTRUCTOR_PASSWORD) {
      dispatch(patchUi({ instructorMode: true }));
      setInstructorPw('');
      setInstructorErr('');
    } else {
      setInstructorErr('Wrong workshop password.');
    }
  };

  const changePassword = () => {
    const res = setPassword(newPw, secCode);
    setPwMsg(res.ok ? { kind: 'ok', text: 'Login password updated.' } : { kind: 'err', text: res.error });
    if (res.ok) { setNewPw(''); setSecCode(''); }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="panel p-6">
        <div className="mb-4 flex items-center gap-2">
          <UserRound className="h-4 w-4 text-violet-400" />
          <h3 className="text-sm font-bold text-white">Consultant profile</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">YOUR NAME</label>
            <input
              className="input"
              value={state.meta.traineeName}
              onChange={(e) => dispatch(patchMeta({ traineeName: e.target.value }))}
              placeholder="Shown on exports and the go-live report"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">CONFIGURATION NAME</label>
            <input
              className="input"
              value={state.meta.configName}
              onChange={(e) => dispatch(patchMeta({ configName: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="panel p-6">
        <div className="mb-4 flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-violet-400" />
          <h3 className="text-sm font-bold text-white">Mode</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => dispatch(setMode('guided'))}
            className={state.meta.mode === 'guided' ? 'btn-primary flex-1' : 'btn-ghost flex-1'}
          >
            Guided project
          </button>
          <button
            onClick={() => dispatch(setMode('sandbox'))}
            className={state.meta.mode === 'sandbox' ? 'btn-primary flex-1' : 'btn-ghost flex-1'}
          >
            Sandbox
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Guided: follow the Helvion Pharma deployment phase by phase with acceptance checks.
          Sandbox: all modules open, configure freely.
        </p>

        <div className="mt-5 flex items-center justify-between border-t border-slate-700/60 pt-4">
          <div>
            <div className="text-sm font-semibold text-slate-200">Step-by-step coach</div>
            <p className="mt-0.5 max-w-md text-xs text-slate-500">
              A live checklist in every module and on Project Home: what to do, where, with "Take me there"
              links and "Show me" buttons. Turn it off for the original figure-it-out-yourself challenge.
            </p>
          </div>
          <button
            onClick={() => dispatch(patchUi({ coachEnabled: !(state.ui.coachEnabled !== false) }))}
            className={state.ui.coachEnabled !== false ? 'btn-primary !py-1.5 text-xs' : 'btn-ghost !py-1.5 text-xs'}
          >
            {state.ui.coachEnabled !== false ? 'Coach ON' : 'Coach OFF'}
          </button>
        </div>

        <div className="mt-5 border-t border-slate-700/60 pt-4">
          {state.ui.instructorMode ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-amber-300">Instructor mode is ON — all modules unlocked</span>
                <button onClick={() => dispatch(patchUi({ instructorMode: false }))} className="btn-ghost !py-1.5 text-xs">
                  Turn off
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Coach "Show me" buttons (auto-apply the reference setting per step)
                </span>
                <button
                  onClick={() => dispatch(patchUi({ coachShowMe: !(state.ui.coachShowMe !== false) }))}
                  className="btn-ghost !py-1.5 text-xs"
                >
                  {state.ui.coachShowMe !== false ? 'Enabled' : 'Disabled'}
                </button>
              </div>
              <button
                className="btn-ghost w-full !py-1.5 text-xs"
                onClick={() => {
                  const config = buildModelAnswerConfig();
                  dispatch(importState({
                    ...state,
                    meta: { ...state.meta, configName: 'Plant 2 Lakeworth — Model Answer', updatedAt: Date.now() },
                    config,
                    lastRun: null,
                  }));
                }}
              >
                <Wand2 className="h-3.5 w-3.5" /> Load the model-answer configuration (debrief tool)
              </button>
              <p className="text-[10px] text-slate-600">
                Replaces the current configuration with the reference solution — use it to show the class what
                "good" looks like in every module and in the run results.
              </p>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                className="input flex-1"
                type="password"
                value={instructorPw}
                onChange={(e) => setInstructorPw(e.target.value)}
                placeholder="Workshop password (instructor)"
              />
              <button onClick={unlockInstructor} className="btn-ghost">Unlock</button>
            </div>
          )}
          {instructorErr && <p className="mt-2 text-xs text-red-400">{instructorErr}</p>}
        </div>
      </div>

      <div className="panel p-6">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-violet-400" />
          <h3 className="text-sm font-bold text-white">Login password</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password" />
          <input className="input" value={secCode} onChange={(e) => setSecCode(e.target.value)} placeholder="Security code" />
        </div>
        <button onClick={changePassword} className="btn-ghost mt-3">Change password</button>
        {pwMsg && (
          <p className={`mt-2 text-xs ${pwMsg.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{pwMsg.text}</p>
        )}
      </div>

      <div className="panel border-red-900/50 p-6">
        <div className="mb-3 flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-red-400" />
          <h3 className="text-sm font-bold text-white">Reset workspace</h3>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Wipes the entire configuration and project progress and starts a fresh deployment. Export first if you
          want to keep your work.
        </p>
        <button onClick={() => setConfirmReset(true)} className="btn-danger">Reset everything…</button>
      </div>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset workspace?">
        <p className="mb-4 text-sm text-slate-300">
          This deletes your whole configuration and project progress. There is no undo.
        </p>
        <div className="flex gap-2">
          <button onClick={() => setConfirmReset(false)} className="btn-ghost flex-1">Cancel</button>
          <button
            onClick={() => { dispatch(resetWorkspace(state.meta.mode)); setConfirmReset(false); }}
            className="btn-danger flex-1"
          >
            Yes, reset
          </button>
        </div>
      </Modal>
    </div>
  );
}
