import React from 'react';
import { clockLabel, SHIFT, PHYSICS } from '../../data/realityTape.js';

const pct1 = (v) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`);

const PLOT_W = 980;
const PLOT_X0 = 10;
const clampMin = (m) => Math.max(0, Math.min(SHIFT.endMin, m));
const x = (min) => PLOT_X0 + (clampMin(min) / SHIFT.endMin) * PLOT_W;

const CO_LABEL = { minor: 'minor', blend: 'blend', format: 'format', purge: 'purge' };

function slipChip(slipMin) {
  const abs = Math.abs(slipMin);
  const cls = abs <= PHYSICS.adherenceToleranceMin
    ? 'bg-emerald-900/50 text-emerald-300'
    : abs <= 60 ? 'bg-amber-900/60 text-amber-300' : 'bg-red-900/60 text-red-300';
  return <span className={`chip ${cls}`}>{slipMin > 0 ? `+${slipMin}` : slipMin} min</span>;
}

function barClass(r) {
  if (r.starved || r.qtyProduced === 0) return 'fill-red-500';
  return Math.abs(r.slipMin) <= PHYSICS.adherenceToleranceMin ? 'fill-emerald-500' : 'fill-amber-500';
}

function LineGantt({ line, lineIndex, breaks }) {
  const rows = line.runs;
  const topPad = 24;
  const rowH = 30;
  const height = topPad + rows.length * rowH + 12;
  const patternId = `co-hatch-${lineIndex}`;

  return (
    <svg viewBox={`0 0 1000 ${height}`} className="w-full" role="img"
      aria-label={`${line.lineCode} planned vs actual timeline`}>
      <defs>
        <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#0f172a" opacity="0.55" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#f59e0b" strokeWidth="1.5" opacity="0.45" />
        </pattern>
      </defs>

      {/* Break bands */}
      {breaks.map((b) => (
        <g key={b.id}>
          <rect x={x(b.startMin)} y={topPad - 6} width={x(b.startMin + b.durationMin) - x(b.startMin)}
            height={height - topPad - 2} fill="#475569" opacity="0.22" />
          <text x={x(b.startMin) + 2} y={topPad + 2} fontSize="7" fill="#64748b">{b.label}</text>
        </g>
      ))}

      {/* Changeover blocks */}
      {line.changeovers.map((c, i) => {
        const w = Math.max(2, x(c.end) - x(c.start));
        return (
          <g key={i}>
            <rect x={x(c.start)} y={topPad - 6} width={w} height={height - topPad - 2} fill={`url(#${patternId})`} />
            {w > 24 && (
              <text x={x(c.start) + w / 2} y={height - 4} fontSize="8" textAnchor="middle" className="fill-amber-400">
                {CO_LABEL[c.kind] ?? c.kind}
              </text>
            )}
          </g>
        );
      })}

      {/* Hour ticks */}
      {Array.from({ length: 9 }, (_, h) => h * 60).map((m) => (
        <g key={m}>
          <line x1={x(m)} y1={16} x2={x(m)} y2={height - 10} stroke="#334155" strokeWidth="0.5" strokeDasharray="2 3" />
          <text x={x(m)} y={11} fontSize="8" textAnchor={m === 0 ? 'start' : m === SHIFT.endMin ? 'end' : 'middle'} fill="#64748b">
            {clockLabel(m)}
          </text>
        </g>
      ))}

      {/* Runs: planned (outline) above actual (filled) */}
      {rows.map((r, i) => {
        const y0 = topPad + i * rowH;
        const px0 = x(r.plannedStart);
        const pw = Math.max(2, x(Math.max(r.plannedEnd, r.plannedStart)) - px0);
        const ax0 = x(r.actualStart);
        const aw = Math.max(2, x(Math.max(r.actualEnd, r.actualStart)) - ax0);
        const labelX = ax0 + aw + 4;
        const flip = labelX > 880;
        return (
          <g key={r.runId}>
            <rect x={px0} y={y0} width={pw} height={7} rx="1.5" fill="none" stroke="#94a3b8" strokeWidth="1" />
            <rect x={ax0} y={y0 + 10} width={aw} height={12} rx="2" className={barClass(r)} />
            <text x={flip ? ax0 - 4 : labelX} y={y0 + 19} fontSize="8.5"
              textAnchor={flip ? 'end' : 'start'} fill="#94a3b8" className="mono">
              {r.runId}{r.skuCode ? ` · ${r.skuCode}` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ScheduleAdherence({ run }) {
  const k = run.kpis;
  const breaks = run.truth.breaks;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Start adherence', k.startAdherence, `runs starting within ±${PHYSICS.adherenceToleranceMin} min`],
          ['Volume adherence', k.volumeAdherence, 'produced / planned cases'],
          ['Schedule adherence', k.scheduleAdherence, 'start × volume'],
        ].map(([label, v, sub]) => (
          <div key={label} className="panel px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
            <div className={`mono mt-1 text-xl font-bold ${v >= 0.85 ? 'text-emerald-400' : v >= 0.6 ? 'text-amber-400' : 'text-red-400'}`}>
              {pct1(v)}
            </div>
            <div className="text-[11px] text-slate-500">{sub}</div>
          </div>
        ))}
      </div>

      {run.lines.map((L, lineIndex) => (
        <div key={L.lineCode} className="panel space-y-3 p-4">
          <div className="flex items-center gap-2">
            <div className="panel-title">{L.lineCode} — {L.lineName}</div>
            <span className="chip ml-auto bg-slate-800 text-slate-400">
              outline = Cadence APS plan · filled = what the plant did
            </span>
          </div>

          {L.runs.length === 0 ? (
            <p className="text-xs text-slate-600">No released runs reached this line — it stood idle all shift.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <LineGantt line={L} lineIndex={lineIndex} breaks={breaks} />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-700/70 text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="px-2 py-1.5">Run</th><th className="px-2 py-1.5">SKU</th>
                      <th className="px-2 py-1.5">Planned start</th><th className="px-2 py-1.5">Actual start</th>
                      <th className="px-2 py-1.5">Slip</th><th className="px-2 py-1.5">Planned</th>
                      <th className="px-2 py-1.5">Produced</th><th className="px-2 py-1.5">APS feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {L.runs.map((r) => {
                      const fedBack = run.integrationLog.some(
                        (m) => m.system === 'APS' && m.type === 'RUN-ACTUALS' && m.runId === r.runId
                      );
                      return (
                        <tr key={r.runId} className="border-b border-slate-800/50 last:border-0">
                          <td className="mono px-2 py-1 text-slate-300">{r.runId}</td>
                          <td className="mono px-2 py-1 text-slate-300">{r.skuCode ?? <span className="text-red-400">unknown</span>}</td>
                          <td className="mono px-2 py-1 text-slate-400">{clockLabel(r.plannedStart)}</td>
                          <td className="mono px-2 py-1 text-slate-400">{clockLabel(Math.round(r.actualStart))}</td>
                          <td className="px-2 py-1">{slipChip(r.slipMin)}</td>
                          <td className="mono px-2 py-1 text-slate-400">{r.qtyPlanned.toLocaleString()}</td>
                          <td className={`mono px-2 py-1 font-bold ${r.qtyProduced >= r.qtyPlanned ? 'text-slate-200' : r.qtyProduced === 0 ? 'text-red-400' : 'text-amber-400'}`}>
                            {r.qtyProduced.toLocaleString()}
                          </td>
                          <td className="px-2 py-1">
                            {fedBack
                              ? <span className="chip bg-emerald-900/50 text-emerald-300">actuals sent</span>
                              : <span className="chip bg-slate-800 text-slate-500">no feedback</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ))}

      <p className="text-[11px] text-slate-500">
        The plan is Cadence's; the MES's job was to release it, run it and tell the truth about what happened.
        Grey bands are breaks; hatched bands are changeovers the plan did — or did not — leave room for.
      </p>
    </div>
  );
}
