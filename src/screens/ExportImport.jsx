import React, { useRef, useState } from 'react';
import { Download, Upload, FileJson } from 'lucide-react';
import { useStudio, useStudioDispatch } from '../engine/StudioContext.jsx';
import { importState } from '../engine/actions.js';
import { SCHEMA_VERSION } from '../engine/persistence.js';

const APP_TAG = 'forgemes-config-studio-pharma';

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export default function ExportImport() {
  const state = useStudio();
  const dispatch = useStudioDispatch();
  const fileRef = useRef(null);
  const [message, setMessage] = useState(null); // { kind: 'ok'|'err', text }

  const doExport = () => {
    const payload = {
      app: APP_TAG,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      meta: state.meta,
      config: state.config,
      project: state.project,
    };
    const safeName = (state.meta.traineeName || state.meta.configName || 'config')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forgemes-pharma-config-${safeName}-${stamp()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ kind: 'ok', text: 'Configuration exported. Submit the file to your instructor or re-import it on another machine.' });
  };

  const doImport = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        if (payload.app !== APP_TAG) throw new Error('Not a ForgeMES Studio configuration file.');
        if (payload.schemaVersion !== SCHEMA_VERSION) {
          throw new Error(`Schema version mismatch (file v${payload.schemaVersion}, app v${SCHEMA_VERSION}).`);
        }
        if (!payload.config?.plantModel?.nodes) throw new Error('File is missing the plant configuration.');
        dispatch(importState({
          meta: { ...payload.meta, schemaVersion: SCHEMA_VERSION, updatedAt: Date.now() },
          config: payload.config,
          project: payload.project ?? { currentPhase: 0, phases: {}, signoffs: [] },
          lastRun: null,
          ui: state.ui,
        }));
        setMessage({ kind: 'ok', text: `Imported "${payload.meta?.configName ?? 'configuration'}" — workspace replaced.` });
      } catch (err) {
        setMessage({ kind: 'err', text: `Import failed: ${err.message}` });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="panel p-6">
        <div className="panel-title mb-3">Current workspace</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="text-slate-500">Configuration ID</div>
          <div className="mono text-slate-200">{state.meta.configId}</div>
          <div className="text-slate-500">Name</div>
          <div className="text-slate-200">{state.meta.configName}</div>
          <div className="text-slate-500">Consultant</div>
          <div className="text-slate-200">{state.meta.traineeName || '—'}</div>
          <div className="text-slate-500">Mode</div>
          <div className="text-slate-200 capitalize">{state.meta.mode}</div>
          <div className="text-slate-500">Last updated</div>
          <div className="text-slate-200">{new Date(state.meta.updatedAt).toLocaleString()}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="panel p-6">
          <Download className="mb-3 h-6 w-6 text-violet-400" />
          <h3 className="text-sm font-bold text-white">Export configuration</h3>
          <p className="mt-1 mb-4 text-xs text-slate-400">
            Download your full configuration as JSON — your deliverable to submit, or a backup to continue elsewhere.
          </p>
          <button onClick={doExport} className="btn-primary w-full">
            <FileJson className="h-4 w-4" /> Export JSON
          </button>
        </div>

        <div className="panel p-6">
          <Upload className="mb-3 h-6 w-6 text-violet-400" />
          <h3 className="text-sm font-bold text-white">Import configuration</h3>
          <p className="mt-1 mb-4 text-xs text-slate-400">
            Replace this workspace with a previously exported file. Your current work is overwritten.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) doImport(f);
              e.target.value = '';
            }}
          />
          <button onClick={() => fileRef.current?.click()} className="btn-ghost w-full">
            <Upload className="h-4 w-4" /> Choose file…
          </button>
        </div>
      </div>

      {message && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          message.kind === 'ok'
            ? 'border-emerald-800 bg-emerald-950/50 text-emerald-300'
            : 'border-red-800 bg-red-950/50 text-red-300'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
