import React from 'react';

/**
 * Property form for the selected object (the right-hand pane of every real
 * MES modeler). fields = [{ key, label, type: 'text'|'number'|'select'|'toggle',
 * options: [{value,label}], help, placeholder, disabled }]
 */
export default function PropertyPanel({ title, subtitle, fields, values, onChange }) {
  return (
    <div className="panel p-4">
      <div className="panel-title">{title}</div>
      {subtitle && <div className="mono mt-0.5 text-[11px] text-slate-500">{subtitle}</div>}
      <div className="mt-3 space-y-3">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {f.label}
            </label>
            {f.type === 'select' ? (
              <select
                className="input"
                disabled={f.disabled}
                value={values[f.key] ?? ''}
                onChange={(e) => onChange(f.key, e.target.value)}
              >
                <option value="">— select —</option>
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : f.type === 'toggle' ? (
              <button
                disabled={f.disabled}
                onClick={() => onChange(f.key, !values[f.key])}
                className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
                  values[f.key] ? 'bg-violet-600' : 'bg-slate-700'
                }`}
              >
                <span className={`h-5 w-5 rounded-full bg-white transition-transform ${values[f.key] ? 'translate-x-5' : ''}`} />
              </button>
            ) : (
              <input
                className={`input ${f.type === 'number' ? 'mono' : ''}`}
                type={f.type === 'number' ? 'number' : 'text'}
                disabled={f.disabled}
                value={values[f.key] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => onChange(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
              />
            )}
            {f.help && <p className="mt-1 text-[11px] text-slate-500">{f.help}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
