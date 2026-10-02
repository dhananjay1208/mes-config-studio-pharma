import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

/**
 * Editable data grid (the master-data table every platform has).
 * columns = [{ key, label, type: 'text'|'number'|'select'|'toggle'|'readonly',
 *              options, width, mono, render(row) }]
 * rows = array of objects; onChange(rowIndex, key, value); onAdd(); onDelete(rowIndex)
 */
export default function EditableTable({ columns, rows, onChange, onAdd, onDelete, addLabel = 'Add row', emptyText = 'Nothing configured yet.' }) {
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-700/70">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700/70 bg-plant-900">
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500" style={c.width ? { width: c.width } : undefined}>
                  {c.label}
                </th>
              ))}
              {onDelete && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-6 text-center text-xs text-slate-600">{emptyText}</td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.id ?? i} className="border-b border-slate-800/60 last:border-0 hover:bg-plant-900/50">
                {columns.map((c) => (
                  <td key={c.key} className="px-2 py-1.5">
                    {c.render ? c.render(row, i) : c.type === 'readonly' ? (
                      <span className={`px-1 text-slate-400 ${c.mono ? 'mono' : ''}`}>{row[c.key]}</span>
                    ) : c.type === 'select' ? (
                      <select
                        className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm text-slate-200 outline-none hover:border-slate-600 focus:border-violet-500"
                        value={row[c.key] ?? ''}
                        onChange={(e) => onChange(i, c.key, e.target.value)}
                      >
                        <option value="" className="bg-plant-900">—</option>
                        {(typeof c.options === 'function' ? c.options(row) : c.options ?? []).map((o) => (
                          <option key={o.value} value={o.value} className="bg-plant-900">{o.label}</option>
                        ))}
                      </select>
                    ) : c.type === 'toggle' ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-violet-600"
                        checked={Boolean(row[c.key])}
                        onChange={(e) => onChange(i, c.key, e.target.checked)}
                      />
                    ) : (
                      <input
                        className={`w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm text-slate-200 outline-none hover:border-slate-600 focus:border-violet-500 ${c.mono ? 'mono' : ''}`}
                        type={c.type === 'number' ? 'number' : 'text'}
                        value={row[c.key] ?? ''}
                        onChange={(e) => onChange(i, c.key, c.type === 'number' ? Number(e.target.value) : e.target.value)}
                      />
                    )}
                  </td>
                ))}
                {onDelete && (
                  <td className="px-2 text-right">
                    <button onClick={() => onDelete(i)} className="text-slate-600 hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onAdd && (
        <button onClick={onAdd} className="btn-ghost mt-2 !py-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </button>
      )}
    </div>
  );
}
