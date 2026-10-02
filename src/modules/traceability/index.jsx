import React, { useMemo, useState } from 'react';
import { AlertTriangle, Layers } from 'lucide-react';
import { useStudio, useStudioDispatch } from '../../engine/StudioContext.jsx';
import { setConfig } from '../../engine/actions.js';
import { useModuleTab } from '../../components/config/useModuleTab.js';
import { allMachinesInFlow } from '../../engine/selectors.js';
import { validateTraceability } from '../../engine/validate.js';
import EditableTable from '../../components/config/EditableTable.jsx';
import TogglePanel from '../../components/config/TogglePanel.jsx';
import { PARTNERS } from '../../data/customer.js';

const TABS = [
  ['track', 'Track Points'],
  ['serial', 'Serialization'],
  ['agg', 'Aggregation'],
  ['gene', 'Genealogy'],
  ['repo', 'Repository'],
];

export default function TraceabilityModule() {
  const state = useStudio();
  const dispatch = useStudioDispatch();
  const [tab, setTab] = useModuleTab('track');
  const findings = useMemo(() => validateTraceability(state.config), [state.config]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === id ? 'bg-violet-600/20 text-violet-300' : 'text-slate-500 hover:bg-plant-800 hover:text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'track' && <TrackPointsTab state={state} dispatch={dispatch} />}
      {tab === 'serial' && <SerializationTab state={state} dispatch={dispatch} />}
      {tab === 'agg' && <AggregationTab state={state} dispatch={dispatch} />}
      {tab === 'gene' && <GenealogyTab state={state} dispatch={dispatch} />}
      {tab === 'repo' && <RepositoryTab state={state} dispatch={dispatch} />}

      <div className="panel p-4">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="panel-title !text-slate-300">Configuration checks ({findings.length})</span>
        </div>
        {findings.length === 0 ? (
          <p className="text-xs text-emerald-400">The chain holds: every carton gets a verified UI, every level aggregates, every serial reaches the EU Hub.</p>
        ) : (
          <ul className="space-y-1.5">
            {findings.map((f) => (
              <li key={f.id} className={`text-[11px] leading-snug ${f.level === 'error' ? 'text-red-400/90' : 'text-amber-400/90'}`}>• {f.msg}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function TrackPointsTab({ state, dispatch }) {
  const machines = allMachinesInFlow(state.config);
  const tps = state.config.traceability.trackPoints;
  const commit = (next) => dispatch(setConfig(['traceability', 'trackPoints'], next));

  return (
    <div className="panel space-y-3 p-4">
      <p className="text-xs text-slate-500">
        Track points are the events the MES records as a batch moves through the line — batch start at the press
        (IBC docked), coated batch at the coater, blister lot opened, batch complete at the cartoner. No track
        point at a machine, and lot consumption there has no event to hang on.
      </p>
      <EditableTable
        columns={[
          { key: 'id', label: 'ID', type: 'readonly', mono: true, width: 110 },
          { key: 'machineId', label: 'Machine', type: 'select', width: 240,
            options: machines.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` })) },
          { key: 'event', label: 'Event', type: 'select', width: 160, options: [
            { value: 'runStart', label: 'Run start' },
            { value: 'runComplete', label: 'Run complete' },
          ]},
          { key: 'idLevel', label: 'Identity captured', type: 'select', options: [
            { value: 'order', label: 'Order number (in the bank)' },
            { value: 'run', label: 'Run ID (on the line)' },
            { value: 'ui', label: 'Carton UI (at/after the serialization station only!)' },
          ]},
        ]}
        rows={tps}
        onChange={(i, key, value) => commit(tps.map((t, idx) => (idx === i ? { ...t, [key]: value } : t)))}
        onAdd={() => commit([...tps, { id: `TP-${tps.length + 1}`, machineId: '', event: 'runStart', idLevel: 'run' }])}
        onDelete={(i) => commit(tps.filter((_, idx) => idx !== i))}
        addLabel="Add track point"
        emptyText="No track points — runs start and finish without a single recorded event."
      />
      <p className="text-[11px] text-slate-500">
        The identity law of this plant: ORDER → BATCH → carton UI at the cartoner's serialization station. Never a
        UI before it — blends, tablets and blisters carry lots, but only a carton has a legal (FMD) identity.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function SerializationTab({ state, dispatch }) {
  const s = state.config.traceability.serialization;
  const setSer = (key, value) => dispatch(setConfig(['traceability', 'serialization', key], value));

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="panel-title mb-2">UI printing station</div>
        <select className="input !w-80" value={s.uiPrintMachineClass ?? ''}
          onChange={(e) => setSer('uiPrintMachineClass', e.target.value || null)}>
          <option value="">— not configured —</option>
          <option value="maker">Tablet press (tablet level)</option>
          <option value="packer">Blister machine (blister level)</option>
          <option value="cartoner">Cartoner — serialization station (carton level)</option>
          <option value="casePacker">Case packer (case level)</option>
        </select>
        {s.uiPrintMachineClass && s.uiPrintMachineClass !== 'cartoner' && (
          <p className="mt-2 text-xs text-red-400">
            ⚠ A unique identifier belongs to a CARTON. Printing it at the {s.uiPrintMachineClass} marks the
            wrong object — FMD (and the engine) accepts the cartoner's serialization station only.
          </p>
        )}
        {!s.uiPrintMachineClass && (
          <p className="mt-2 text-xs text-amber-400">Without a UI print station, every carton leaves the plant legally anonymous.</p>
        )}
        <p className="mt-3 text-[11px] text-slate-500">
          FMD serialization: each carton receives a unique identifier (GTIN + randomised serial from the L4 pool +
          batch + expiry) printed as a DataMatrix by the station's thermal-inkjet head and camera-verified before
          the anti-tamper seal goes on. It is printed on the carton — it is not a label.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TogglePanel
          title="100% print & verify"
          description="DataMatrix read-back at full line speed — every printed UI is read again before the carton leaves the station."
          enabled={s.cameraVerify}
          onToggle={(v) => setSer('cameraVerify', v)}
        >
          <p className="text-[11px] text-slate-500">
            Off means unreadable codes ship — and they fail verification at the pharmacy months later, when
            nobody remembers the shift, as suspected falsified medicines.
          </p>
        </TogglePanel>
        <TogglePanel
          title="Void on verify fail"
          description="A carton whose UI cannot be read back is voided and rejected, not shipped with an unverifiable identity."
          enabled={s.voidOnFail}
          onToggle={(v) => setSer('voidOnFail', v)}
        >
          <p className="text-[11px] text-slate-500">
            Verify without void is detection without action: the camera sees the bad print, the MES records
            it, and the carton ships anyway.
          </p>
        </TogglePanel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function AggregationTab({ state, dispatch }) {
  const levels = state.config.traceability.aggregation.levels;
  const commit = (next) => dispatch(setConfig(['traceability', 'aggregation', 'levels'], next));

  return (
    <div className="panel space-y-3 p-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-slate-500">
          The parent-child pyramid: carton → bundle → case → pallet SSCC. Each level needs a scan at the
          machine that builds it, or the chain of custody has a hole exactly that wide. FMD does not mandate
          aggregation — Helvion builds it for the warehouse and DSCSA-readiness (best practice, not law).
        </p>
        <button className="btn-ghost shrink-0 !py-1.5 text-xs"
          onClick={() => commit([
            { level: 'carton', scanMachineClass: 'cartoner', childCount: 10 },
            { level: 'case', scanMachineClass: 'casePacker', childCount: 20 },
            { level: 'pallet', scanMachineClass: 'palletizer', childCount: 48 },
          ])}>
          <Layers className="h-3.5 w-3.5" /> Standard pyramid
        </button>
      </div>
      <EditableTable
        columns={[
          { key: 'level', label: 'Level', type: 'select', width: 150, options: [
            { value: 'carton', label: 'Bundle (×10 cartons)' },
            { value: 'case', label: 'Case (×20 bundles)' },
            { value: 'pallet', label: 'Pallet (SSCC)' },
          ]},
          { key: 'scanMachineClass', label: 'Scanned at', type: 'select', width: 190, options: [
            { value: 'cartoner', label: 'Cartoner outfeed (bundler)' },
            { value: 'casePacker', label: 'Case packer' },
            { value: 'palletizer', label: 'Palletizer' },
          ]},
          { key: 'childCount', label: 'Children per parent', type: 'number', mono: true, width: 150 },
        ]}
        rows={levels}
        onChange={(i, key, value) => commit(levels.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)))}
        onAdd={() => commit([...levels, { level: 'carton', scanMachineClass: 'cartoner', childCount: 10 }])}
        onDelete={(i) => commit(levels.filter((_, idx) => idx !== i))}
        addLabel="Add aggregation level"
        emptyText="No aggregation — 200 loose carton UIs per case with no parent; recalls mean opening boxes."
      />
      <p className="text-[11px] text-slate-500">
        This plant: 10 cartons per bundle, 20 bundles (200 cartons) per case, 48 cases per pallet.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function GenealogyTab({ state, dispatch }) {
  const g = state.config.traceability.genealogy;
  const items = state.config.materials.items.filter((i) => i.lotTracked);

  const toggleItem = (id) => {
    const list = g.materialLotCapture ?? [];
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    dispatch(setConfig(['traceability', 'genealogy', 'materialLotCapture'], next));
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TogglePanel
        title="IBC blend-lot capture at the press"
        description="Capture the blend lot when the IBC docks on the press — the identity that crosses the batch/discrete boundary."
        enabled={g.blendLotCapture}
        onToggle={(v) => dispatch(setConfig(['traceability', 'genealogy', 'blendLotCapture'], v))}
      >
        <p className="text-[11px] text-slate-500">
          Without it, an LOD excursion in the granulation suite cannot be traced to the cases it ended up in — the
          genealogy chain snaps exactly at the boundary auditors care about most.
        </p>
      </TogglePanel>

      <div className="panel p-4">
        <div className="panel-title mb-2">Material lot capture at consumption</div>
        <p className="mb-3 text-[11px] text-slate-500">
          Tick the lot-tracked materials whose reel / lot is scanned when it is loaded — suspension, film, foil,
          cartons, leaflets, seals, vignettes, labels. Whatever is not captured cannot scope a recall.
        </p>
        {items.length === 0 ? (
          <p className="text-xs text-slate-600">No lot-tracked materials yet — import the material catalog in Products &amp; Materials first.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {items.map((m) => {
              const on = (g.materialLotCapture ?? []).includes(m.id);
              return (
                <button key={m.id} onClick={() => toggleItem(m.id)} title={m.desc}
                  className={`chip !px-2 !py-1 normal-case tracking-normal ${on ? 'bg-violet-600/25 text-violet-200 ring-1 ring-violet-500' : 'bg-plant-800 text-slate-500 hover:text-slate-300'}`}>
                  {m.code}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function RepositoryTab({ state, dispatch }) {
  const r = state.config.traceability.repository;
  const repoPartners = PARTNERS.filter((p) => p.type === 'repository');
  const setRepo = (key, value) => dispatch(setConfig(['traceability', 'repository', key], value));

  return (
    <div className="space-y-4">
      <TogglePanel
        title="EU Hub (FMD) upload"
        description="EU 2016/161 — every carton serial is uploaded to the EU Hub (EMVO) before release; aggregation and shipping events follow as EPCIS."
        enabled={r.enabled}
        onToggle={(v) => setRepo('enabled', v)}
      >
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hub gateway</label>
        <select className="input !w-96" value={r.partnerId ?? ''}
          onChange={(e) => setRepo('partnerId', e.target.value || null)}>
          <option value="">— select —</option>
          {repoPartners.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.commodity})</option>
          ))}
        </select>
        <p className="mt-3 text-[11px] text-slate-500">
          A serial that never reached the Hub fails verification at the pharmacy, and a batch whose serials are not
          uploaded cannot be QP-released — the Hub link is not a nice-to-have integration, it is the license to sell.
        </p>
      </TogglePanel>

      <TogglePanel
        title="Buffer & retry (store-and-forward)"
        description="Store-and-forward when the network wobbles — events queue locally and retry instead of silently dropping off the legal record."
        enabled={r.bufferAndRetry}
        onToggle={(v) => setRepo('bufferAndRetry', v)}
      >
        <p className="text-[11px] text-slate-500">
          The first WAN hiccup of the quarter should cost you nothing but queue depth — not a batch of cartons
          the EU Hub has never heard of.
        </p>
      </TogglePanel>
    </div>
  );
}
