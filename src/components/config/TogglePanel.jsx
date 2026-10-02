import React from 'react';

/** Titled on/off panel — children render only when enabled (rule sections). */
export default function TogglePanel({ title, description, enabled, onToggle, children }) {
  return (
    <div className={`rounded-xl border p-4 transition-colors ${enabled ? 'border-violet-700/60 bg-violet-950/10' : 'border-slate-700/70 bg-plant-850'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
        <button
          onClick={() => onToggle(!enabled)}
          className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
            enabled ? 'bg-violet-600' : 'bg-slate-700'
          }`}
        >
          <span className={`h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      {enabled && children && <div className="mt-4">{children}</div>}
    </div>
  );
}
