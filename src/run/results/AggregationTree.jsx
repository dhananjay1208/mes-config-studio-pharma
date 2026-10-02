import React from 'react';
import { PackageCheck, PackageX, Boxes } from 'lucide-react';

const MARKET_CHIP = {
  EU: 'bg-sky-900/60 text-sky-300',
  EXP: 'bg-violet-600/20 text-violet-300',
  DOM: 'bg-emerald-900/50 text-emerald-300',
};

function Level({ name, count, unit, exemplar, ok }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
      ok ? 'border-slate-800 bg-plant-900/50' : 'border-red-900/60 bg-red-950/20'
    }`}>
      <span className="w-16 shrink-0 font-semibold text-slate-300">{name}</span>
      <span className="mono w-24 shrink-0 text-slate-200">{count != null ? count.toLocaleString() : '—'}</span>
      <span className="w-14 shrink-0 text-slate-600">{unit}</span>
      {exemplar
        ? <span className="mono truncate text-[10px] text-slate-500">{exemplar}</span>
        : <span className="text-[10px] text-slate-600">—</span>}
      <span className="ml-auto shrink-0">
        {ok
          ? <span className="chip bg-emerald-900/50 text-emerald-300">linked</span>
          : <span className="chip bg-red-900/70 text-red-200">GAP</span>}
      </span>
    </div>
  );
}

export default function AggregationTree({ run }) {
  const t = run.trace;
  const perRun = t.perRun ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Unserialized cartons', t.unserializedPacks, t.unserializedPacks === 0],
          ['Unverified shipped cartons', t.unverifiedShippedPacks, t.unverifiedShippedPacks === 0],
          ['Aggregation gaps', t.aggregationGaps, t.aggregationGaps === 0],
          ['Genealogy gaps', t.genealogyGaps, t.genealogyGaps === 0],
        ].map(([label, v, good]) => (
          <div key={label} className="panel px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
            <div className={`mono mt-1 text-xl font-bold ${good ? 'text-emerald-400' : 'text-red-400'}`}>
              {(v ?? 0).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {perRun.length === 0 ? (
        <div className="panel p-4">
          <p className="text-xs text-red-400">
            No run produced traceable output — there is nothing to serialize, aggregate or report.
          </p>
        </div>
      ) : perRun.map((p) => {
        const consumption = (t.consumptionRecords ?? []).filter((c) => c.runId === p.runId);
        const pallets = Math.max(1, Math.ceil(p.cases / 40));
        return (
          <div key={p.runId} className="panel space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Boxes className="h-4 w-4 text-violet-400" />
              <span className="mono text-sm font-bold text-slate-200">{p.skuCode}</span>
              <span className={`chip ${MARKET_CHIP[p.market] ?? 'bg-slate-800 text-slate-300'}`}>{p.market}</span>
              <span className="mono text-xs text-slate-500">{p.runId} · {p.lineCode}</span>
              <span className={`chip ml-auto ${p.serialized ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/70 text-red-200'}`}>
                {p.serialized ? `serialized · ${p.rangeId}` : 'NOT serialized — no valid UI range'}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <span className="chip bg-slate-800 text-slate-300">{p.packs.toLocaleString()} cartons</span>
              {p.badPrints > 0 && <span className="chip bg-amber-900/60 text-amber-300">{p.badPrints} bad prints</span>}
              {p.voided > 0 && <span className="chip bg-emerald-900/50 text-emerald-300">{p.voided} voided by camera</span>}
              {p.unverifiedShipped > 0 && (
                <span className="chip bg-red-900/70 text-red-200">{p.unverifiedShipped} unverified UIs SHIPPED</span>
              )}
            </div>

            <div className="space-y-1">
              <Level name="Pallet" count={p.aggregation.pallet ? pallets : null} unit="pallets"
                exemplar={p.exemplarSscc} ok={p.aggregation.pallet} />
              <Level name="Case" count={p.cases} unit="cases" exemplar={null} ok={p.aggregation.case} />
              <Level name="Bundle" count={Math.ceil(p.cartons / 10)} unit="bundles" exemplar={null} ok={p.aggregation.carton} />
              <Level name="Carton" count={p.packs} unit="cartons" exemplar={p.exemplarUi} ok={p.serialized} />
            </div>

            <div>
              <div className="panel-title mb-1.5">Genealogy chain</div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-lg border px-2.5 py-1 ${
                  p.blendLotCaptured
                    ? 'border-slate-700 bg-plant-900/60 text-slate-300'
                    : 'border-dashed border-red-700 bg-red-950/20 text-red-300'
                }`}>
                  <span className="mono">{p.blendLot}</span>
                  {!p.blendLotCaptured && <span className="ml-1.5 text-[10px]">not captured</span>}
                </span>
                <span className="text-slate-600">→</span>
                <span className="rounded-lg border border-slate-700 bg-plant-900/60 px-2.5 py-1 text-slate-300">
                  <span className="mono">{p.runId}</span> <span className="text-[10px] text-slate-500">press batch</span>
                </span>
                <span className="text-slate-600">→</span>
                <span className={`rounded-lg border px-2.5 py-1 ${
                  p.serialized
                    ? 'border-slate-700 bg-plant-900/60 text-slate-300'
                    : 'border-dashed border-red-700 bg-red-950/20 text-red-300'
                }`}>
                  <span className="mono">{p.exemplarUi ?? 'no carton UI'}</span>
                </span>
              </div>
            </div>

            <div>
              <div className="panel-title mb-1.5">Consumption records ({consumption.length})</div>
              {consumption.length === 0 ? (
                <p className="text-xs text-red-400">
                  No lot-tracked material was recorded against this run — the BOM resolves nothing traceable.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-700/70 text-[10px] uppercase tracking-wider text-slate-500">
                        <th className="px-2 py-1.5">Material</th><th className="px-2 py-1.5">Lot</th>
                        <th className="px-2 py-1.5">Consumed at</th><th className="px-2 py-1.5">Captured</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consumption.map((c, i) => (
                        <tr key={i} className="border-b border-slate-800/50 last:border-0">
                          <td className="mono px-2 py-1 text-slate-300">{c.materialCode}</td>
                          <td className="mono px-2 py-1 text-slate-400">{c.captured ? c.lot : '—'}</td>
                          <td className="mono px-2 py-1 text-slate-400">{c.machineCode}</td>
                          <td className="px-2 py-1">
                            {c.captured
                              ? <span className="inline-flex items-center gap-1 text-emerald-400"><PackageCheck className="h-3.5 w-3.5" /> ✓</span>
                              : <span className="inline-flex items-center gap-1 text-red-400"><PackageX className="h-3.5 w-3.5" /> ✗ no capture point</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <p className="text-[11px] text-slate-500">
        In a recall you walk this tree upward: carton UI → bundle → case → pallet, then back down to the IBC blend lot and its granulation batch.
        Every GAP marker is a level where the chain simply stops, and the recall scope becomes "everything we shipped".
      </p>
    </div>
  );
}
