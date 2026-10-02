import React from 'react';
import { Trash2 } from 'lucide-react';

/**
 * A configuration rule rendered as a sentence with inline controls —
 * "max [2] units with [SUNROOF] in any [5] — [Hard]". Children are the inline
 * pieces; the row supplies layout + delete.
 */
export default function RuleRow({ onDelete, children, tone = 'default' }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
      tone === 'hard' ? 'border-red-900/60 bg-red-950/20' : 'border-slate-700/70 bg-plant-900/60'
    }`}>
      <div className="flex flex-1 flex-wrap items-center gap-2 text-slate-300">{children}</div>
      {onDelete && (
        <button onClick={onDelete} className="text-slate-600 hover:text-red-400">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Inline number input for RuleRow sentences. */
export function RuleNum({ value, onChange, min = 1, max = 99, width = 'w-14' }) {
  return (
    <input
      type="number"
      className={`mono ${width} rounded border border-slate-600 bg-plant-950 px-1.5 py-0.5 text-center text-sm text-white outline-none focus:border-violet-500`}
      value={value}
      min={min} max={max}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

/** Inline select for RuleRow sentences. */
export function RuleSelect({ value, onChange, options, width = '' }) {
  return (
    <select
      className={`rounded border border-slate-600 bg-plant-950 px-1.5 py-0.5 text-sm text-white outline-none focus:border-violet-500 ${width}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
