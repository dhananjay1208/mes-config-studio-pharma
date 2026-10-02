import React from 'react';
import { Cable } from 'lucide-react';
import { clockLabel, PHYSICS } from '../../data/realityTape.js';

const pct1 = (v) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`);

const STATUS_CHIP = {
  ok: 'bg-emerald-900/60 text-emerald-300',
  unmapped: 'bg-slate-800 text-red-300',
  noConnection: 'bg-red-900/70 text-red-200',
  badNode: 'bg-red-900/60 text-red-300',
  crossSignal: 'bg-amber-900/60 text-amber-300',
  scaleError: 'bg-amber-900/60 text-amber-300',
};
const STATUS_LABEL = {
  ok: 'ok',
  unmapped: 'unmapped',
  noConnection: 'no connection',
  badNode: 'bad node',
  crossSignal: 'cross-wired',
  scaleError: 'scale error',
};

// --- LOD sparkline (FBD2 NIR) -----------------------------------------------
const CH_W = 940;
const CH_H = 150;
const CH_X0 = 44;
const CH_Y0 = 12;

function MoistureChart({ trace, frozenCaught, alarmClock }) {
  if (!trace || trace.length === 0) return null;
  const t0 = trace[0].atMin;
  const t1 = trace[trace.length - 1].atMin;
  const values = trace.flatMap((p) => [p.truth, p.recorded]);
  const lo = Math.min(PHYSICS.lodWindow.lo, ...values) - 0.2;
  const hi = Math.max(PHYSICS.lodWindow.hi, ...values) + 0.2;
  const px = (m) => CH_X0 + ((m - t0) / Math.max(1, t1 - t0)) * (CH_W - CH_X0 - 12);
  const py = (v) => CH_Y0 + (1 - (v - lo) / (hi - lo)) * (CH_H - CH_Y0 - 22);

  const path = (key) => trace.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.atMin).toFixed(1)},${py(p[key]).toFixed(1)}`).join(' ');
  const specHi = PHYSICS.lodWindow.hi;

  // Red band: contiguous window where truth exceeds spec.
  const oos = trace.filter((p) => p.truth > specHi);
  const oosStart = oos.length ? oos[0].atMin : null;
  const oosEnd = oos.length ? oos[oos.length - 1].atMin : null;

  return (
    <svg viewBox={`0 0 ${CH_W} ${CH_H}`} className="w-full" role="img" aria-label="FBD2 blend LOD: truth vs recorded">
      {oosStart != null && (
        <>
          <rect x={px(oosStart)} y={CH_Y0} width={Math.max(2, px(oosEnd) - px(oosStart))} height={CH_H - CH_Y0 - 22}
            fill="#dc2626" opacity="0.16" />
          <text x={px(oosStart) + 4} y={CH_Y0 + 10} fontSize="9" fill="#fca5a5">out of spec (truth)</text>
        </>
      )}

      {/* spec line */}
      <line x1={CH_X0} y1={py(specHi)} x2={CH_W - 12} y2={py(specHi)} stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" />
      <text x={4} y={py(specHi) + 3} fontSize="9" fill="#ef4444">{specHi}%</text>
      <text x={4} y={py(PHYSICS.lodWindow.lo) + 3} fontSize="9" fill="#64748b">{PHYSICS.lodWindow.lo}%</text>

      {/* hour ticks */}
      {[120, 180, 240, 300].filter((m) => m >= t0 && m <= t1).map((m) => (
        <g key={m}>
          <line x1={px(m)} y1={CH_Y0} x2={px(m)} y2={CH_H - 22} stroke="#334155" strokeWidth="0.5" strokeDasharray="2 3" />
          <text x={px(m)} y={CH_H - 10} fontSize="9" textAnchor="middle" fill="#64748b">{clockLabel(m)}</text>
        </g>
      ))}

      <path d={path('truth')} fill="none" stroke="#f87171" strokeWidth="1.8" />
      <path d={path('recorded')} fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeDasharray="5 3" />

      <g transform={`translate(${CH_W - 230}, ${CH_Y0 + 4})`}>
        <line x1="0" y1="0" x2="16" y2="0" stroke="#f87171" strokeWidth="1.8" />
        <text x="21" y="3" fontSize="9" fill="#94a3b8">truth (lab)</text>
        <line x1="94" y1="0" x2="110" y2="0" stroke="#38bdf8" strokeWidth="1.8" strokeDasharray="5 3" />
        <text x="115" y="3" fontSize="9" fill="#94a3b8">recorded by MES</text>
      </g>

      <text x={CH_X0} y={CH_H - 10} fontSize="9" fill={frozenCaught ? '#34d399' : '#f87171'}>
        {frozenCaught
          ? `flatline alarm at ${alarmClock ?? '—'} — probe flagged dead, lab sampling ordered`
          : 'no alarm — the MES believed 12.5% all morning'}
      </text>
    </svg>
  );
}

// --- view --------------------------------------------------------------------
export default function ConnectivityHealth({ run }) {
  const c = run.connectivity;
  const grid = c.grid ?? [];

  const byMachine = [];
  for (const row of grid) {
    let group = byMachine.find((g) => g.machineCode === row.machineCode);
    if (!group) {
      group = { machineCode: row.machineCode, machineClass: row.machineClass, rows: [] };
      byMachine.push(group);
    }
    group.rows.push(row);
  }

  const okCount = grid.filter((r) => r.status === 'ok').length;
  const stopRows = grid.filter((r) => r.detectedStops != null || r.missedStops != null);
  const alarm = (c.signalEvents ?? []).find((e) => e.kind === 'flatline');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="panel px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Data fidelity</div>
          <div className={`mono mt-1 text-2xl font-bold ${c.dataFidelity >= 0.9 ? 'text-emerald-400' : c.dataFidelity >= 0.6 ? 'text-amber-400' : 'text-red-400'}`}>
            {pct1(c.dataFidelity)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">correctly-recorded signal-minutes / required signal-minutes</div>
        </div>
        <div className="panel px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Signals recording correctly</div>
          <div className={`mono mt-1 text-2xl font-bold ${okCount === grid.length && grid.length > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {okCount} / {grid.length}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">machine × signal rows in the dictionary</div>
        </div>
        <div className="panel px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Signal-quality rules</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className={`chip ${c.frozenCaught ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/60 text-red-300'}`}>
              flatline {c.frozenCaught ? 'caught' : 'missed'}
            </span>
            <span className={`chip ${c.staleCaught ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/60 text-red-300'}`}>
              stale data {c.staleCaught ? 'caught' : 'missed'}
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500">a dead probe that never alarms is worse than no probe</div>
        </div>
      </div>

      <div className="panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <Cable className="h-4 w-4 text-violet-400" />
          <div className="panel-title">Machine × signal grid</div>
        </div>
        {byMachine.length === 0 ? (
          <p className="text-xs text-red-400">
            No connectable machines in the plant model — the MES has no eyes on this factory at all.
          </p>
        ) : (
          <div className="space-y-3">
            {byMachine.map((g) => (
              <div key={g.machineCode} className="rounded-lg border border-slate-800 bg-plant-900/40 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="mono text-sm font-bold text-slate-200">{g.machineCode}</span>
                  <span className="chip bg-slate-800 text-slate-400">{g.machineClass}</span>
                  <span className="ml-auto text-[11px] text-slate-500">
                    {g.rows.filter((r) => r.status === 'ok').length}/{g.rows.length} ok
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.rows.map((r) => (
                    <span key={r.signal} className={`chip ${STATUS_CHIP[r.status] ?? 'bg-slate-800 text-slate-300'}`}
                      title={`${r.label}${r.pollMs ? ` · poll ${r.pollMs} ms` : ''}`}>
                      {r.signal}{r.critical ? ' *' : ''} · {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  ))}
                </div>
                {g.rows.some((r) => (r.notes ?? []).length > 0) && (
                  <ul className="mt-2 space-y-0.5">
                    {g.rows.flatMap((r) => (r.notes ?? []).map((n, i) => (
                      <li key={`${r.signal}-${i}`} className="text-[11px] text-slate-500">
                        <span className="mono text-slate-400">{r.signal}</span> — {n}
                      </li>
                    )))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-500">
          * = critical signal. A cross-wired or mis-scaled tag is worse than an unmapped one: the MES records a
          number with confidence and everyone downstream believes it.
        </p>
      </div>

      <div className="panel p-4">
        <div className="panel-title mb-2">Stops the sampling could see</div>
        {stopRows.length === 0 ? (
          <p className="text-xs text-slate-600">
            No state word is mapped and sampled anywhere — stop detection could not even be attempted.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-700/70 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-2 py-1.5">Machine</th><th className="px-2 py-1.5">Poll period</th>
                  <th className="px-2 py-1.5">Detected stops</th><th className="px-2 py-1.5">Missed stops</th>
                  <th className="px-2 py-1.5">Shortest visible stop</th>
                </tr>
              </thead>
              <tbody>
                {stopRows.map((r) => (
                  <tr key={r.machineId} className="border-b border-slate-800/50 last:border-0">
                    <td className="mono px-2 py-1 text-slate-300">{r.machineCode}</td>
                    <td className="mono px-2 py-1 text-slate-400">{r.pollMs != null ? `${r.pollMs} ms` : '—'}</td>
                    <td className="mono px-2 py-1 text-emerald-400">{r.detectedStops ?? 0}</td>
                    <td className={`mono px-2 py-1 font-bold ${(r.missedStops ?? 0) > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                      {r.missedStops ?? 0}
                    </td>
                    <td className="mono px-2 py-1 text-slate-400">
                      {r.pollMs != null
                        ? `${(PHYSICS.microStopDetectFactor * (r.pollMs / 60000)).toFixed(1)} min`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-500">
          A stop must last at least {PHYSICS.microStopDetectFactor} × the poll period to be recorded. At 30-second
          polling the day's 6–9 second foil splices simply never happened, as far as the MES is concerned.
        </p>
      </div>

      <div className="panel p-4">
        <div className="panel-title mb-2">FBD2 blend moisture (LOD) — what was true vs what was recorded</div>
        {(c.lodTrace ?? []).length === 0 ? (
          <p className="text-xs text-slate-600">No LOD trace for this run.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[620px]">
              <MoistureChart trace={c.lodTrace} frozenCaught={c.frozenCaught} alarmClock={alarm?.clock} />
            </div>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          The NIR probe on the dryer froze. Truth drifted wet past the {PHYSICS.lodWindow.hi} % window while the recorded
          value sat perfectly still — the signature of a dead sensor, and exactly what a flatline rule exists to catch.
          The lab's LOD-oven result would have arrived hours later, after the sub-lot had docked on PR3.
        </p>
      </div>

      <div className="panel p-4">
        <div className="panel-title mb-2">Signal-quality events</div>
        {(c.signalEvents ?? []).length === 0 ? (
          <p className="text-xs text-red-400">
            The MES raised no signal-quality events all day. Two signals failed — it simply did not notice.
          </p>
        ) : (
          <div className="space-y-1">
            {c.signalEvents.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="mono w-12 shrink-0 text-slate-500">{e.clock}</span>
                <span className="chip shrink-0 bg-violet-600/20 text-violet-300">{e.kind}</span>
                <span className="text-slate-300">{e.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
