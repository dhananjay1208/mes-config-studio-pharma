import React from 'react';

/**
 * Labeled threshold slider with a live consequence sentence — the pattern for
 * short-stop thresholds, horizons, batch sizes.
 */
export default function ThresholdSlider({ label, value, min, max, step = 1, unit, onChange, example }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</label>
        <span className="mono text-sm font-bold text-violet-300">{value}{unit ? ` ${unit}` : ''}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-violet-600"
      />
      {example && <p className="mt-1 text-[11px] text-slate-500">{example}</p>}
    </div>
  );
}
