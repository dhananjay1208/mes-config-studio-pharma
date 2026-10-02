import React from 'react';
import { clockLabel, PHYSICS } from '../../data/realityTape.js';
import { believedChangeoverMin } from '../../engine/scheduleCheck.js';

const KIND_CHIP = {
  minor: 'bg-slate-800 text-slate-300',
  blend: 'bg-sky-900/60 text-sky-300',
  format: 'bg-amber-900/60 text-amber-300',
  purge: 'bg-red-900/60 text-red-300',
};

export default function ChangeoverReport({ run, config }) {
  const skusByCode = new Map(config.materials.skus.map((s) => [s.code, s]));
  const model = config.apsIntegration.changeoverModel;

  const rows = run.lines.flatMap((L) =>
    L.changeovers.map((c) => ({
      ...c,
      lineCode: L.lineCode,
      believedMin: believedChangeoverMin(model, skusByCode.get(c.fromSku) ?? null, skusByCode.get(c.toSku) ?? null),
    }))
  ).sort((a, b) => a.start - b.start);

  const actualTotal = rows.reduce((s, c) => s + (c.netMin ?? (c.end - c.start)), 0);
  const believedTotal = rows.reduce((s, c) => s + c.believedMin, 0);
  const purgeOn = Boolean(config.apsIntegration.purgeEnforcement?.enabled);
  const purgeLineCode = run.lines[PHYSICS.potentCleanOwedOnLineIndex]?.lineCode ?? 'the potent line';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="panel px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Actual changeover time (tape physics)</div>
          <div className={`mono mt-1 text-xl font-bold ${actualTotal <= 60 ? 'text-emerald-400' : actualTotal <= 180 ? 'text-amber-400' : 'text-red-400'}`}>
            {actualTotal} min
          </div>
          <div className="text-[11px] text-slate-500">{rows.length} changeover(s) across all lines</div>
        </div>
        <div className="panel px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">What your changeover model believed</div>
          <div className={`mono mt-1 text-xl font-bold ${believedTotal >= actualTotal ? 'text-emerald-400' : believedTotal > 0 ? 'text-amber-400' : 'text-red-400'}`}>
            {believedTotal} min
          </div>
          <div className="text-[11px] text-slate-500">
            {rows.length > 0 && believedTotal === 0
              ? 'your model believes changeovers are free — feasibility checks waved everything through'
              : believedTotal < actualTotal
                ? `${actualTotal - believedTotal} min of reality your model did not see`
                : 'model covers the physics'}
          </div>
        </div>
      </div>

      <div className="panel p-4">
        <div className="panel-title mb-2">All changeovers, wall-clock order</div>
        {rows.length === 0 ? (
          <p className="text-xs text-slate-600">No changeovers — a single-SKU day per line, or nothing ran at all.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-700/70 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-2 py-1.5">Line</th><th className="px-2 py-1.5">Transition</th>
                  <th className="px-2 py-1.5">Type</th><th className="px-2 py-1.5">Net minutes</th>
                  <th className="px-2 py-1.5">Believed</th><th className="px-2 py-1.5">Window</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={i} className="border-b border-slate-800/50 last:border-0">
                    <td className="mono px-2 py-1 text-slate-400">{c.lineCode}</td>
                    <td className="px-2 py-1">
                      <span className="mono text-slate-200">{c.fromSku}</span>
                      <span className="text-slate-600"> → </span>
                      <span className="mono text-slate-200">{c.toSku}</span>
                    </td>
                    <td className="px-2 py-1"><span className={`chip ${KIND_CHIP[c.kind] ?? 'bg-slate-800 text-slate-300'}`}>{c.kind}</span></td>
                    <td className={`mono px-2 py-1 font-bold ${c.netMin >= 180 ? 'text-red-400' : c.netMin >= 120 ? 'text-amber-400' : 'text-slate-200'}`}>
                      {c.netMin} min
                    </td>
                    <td className={`mono px-2 py-1 ${c.believedMin < c.netMin ? 'text-red-400' : 'text-slate-400'}`}>{c.believedMin} min</td>
                    <td className="mono px-2 py-1 text-slate-400">{clockLabel(c.start)}–{clockLabel(c.end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-500">
          The plan's gaps were checked against your changeover MODEL; the day ran on the tape's PHYSICS
          ({PHYSICS.changeoverMin.sameBlendSameFormat}/{PHYSICS.changeoverMin.blendChange}/{PHYSICS.changeoverMin.formatChange}/{PHYSICS.changeoverMin.potentClean} min
          for line clearance / product change / tooling change / validated potent clean). Every minute your model
          under-believes is a minute the whole day slips.
        </p>
      </div>

      <div className={`panel p-4 ${purgeOn ? '' : 'border-red-900/60'}`}>
        <div className={`panel-title mb-2 ${purgeOn ? '' : '!text-red-400'}`}>Night clean — potent segregation</div>
        {purgeOn ? (
          <p className="text-xs text-emerald-400">
            Clean enforcement is ON: the {PHYSICS.changeoverMin.potentClean}-min validated clean (swab + QA release) owed on {purgeLineCode} after
            last night's Zentrix 50 mg run was dispatched into the night window. The line opened released and clean, and it cost today nothing.
          </p>
        ) : (
          <p className="text-xs text-red-300">
            Clean enforcement is OFF: nobody dispatched the {PHYSICS.changeoverMin.potentClean}-min validated clean owed on {purgeLineCode}.
            Last night's Zentrix residue was still in the line at 06:00 with no swab on record — check Quality Results for what that did to the first cases.
          </p>
        )}
      </div>
    </div>
  );
}
