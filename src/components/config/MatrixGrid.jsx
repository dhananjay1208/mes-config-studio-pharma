import React from 'react';

/**
 * Changeover matrix editor (Opcenter APS pattern): rows = FROM, cols = TO.
 * items = [{ code, name, hex, highlight }] — hex renders a color swatch,
 * highlight marks special rows/cols (e.g. tri-coat).
 * value = { [fromCode]: { [toCode]: minutes } }
 * onChange(fromCode, toCode, minutes)
 */
export default function MatrixGrid({ items, value, onChange, unit = 'min' }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700/70">
      <table className="text-center text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-plant-900 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
              From \ To
            </th>
            {items.map((c) => (
              <th key={c.code} className={`min-w-[52px] px-1 py-2 ${c.highlight ? 'bg-violet-950/40' : 'bg-plant-900'}`}>
                <Swatch item={c} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((from) => (
            <tr key={from.code} className="border-t border-slate-800/60">
              <td className={`sticky left-0 px-2 py-1 text-left ${from.highlight ? 'bg-violet-950/40' : 'bg-plant-900'}`}>
                <Swatch item={from} withName />
              </td>
              {items.map((to) => {
                const same = from.code === to.code;
                const v = value?.[from.code]?.[to.code];
                return (
                  <td key={to.code} className={`px-0.5 py-0.5 ${from.highlight || to.highlight ? 'bg-violet-950/20' : ''}`}>
                    {same ? (
                      <span className="text-slate-700">—</span>
                    ) : (
                      <input
                        className={`mono w-12 rounded border bg-transparent px-1 py-0.5 text-center outline-none focus:border-violet-500 ${
                          v == null || v === '' ? 'border-amber-800/60 text-amber-400/70' : 'border-transparent text-slate-200 hover:border-slate-600'
                        }`}
                        inputMode="numeric"
                        value={v ?? ''}
                        placeholder="·"
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          onChange(from.code, to.code, raw === '' ? null : Number(raw));
                        }}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-slate-800 bg-plant-900 px-2 py-1 text-left text-[10px] text-slate-600">
        Values in {unit}. Empty cells (amber) are treated as not maintained — the sequencer falls back to the worst case.
      </div>
    </div>
  );
}

function Swatch({ item, withName = false }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {item.hex && <span className="inline-block h-3 w-3 rounded-full border border-slate-600" style={{ background: item.hex }} />}
      <span className="mono text-[10px] text-slate-300">{item.code}</span>
      {withName && <span className="hidden text-[10px] text-slate-500 lg:inline">{item.name}</span>}
    </span>
  );
}
