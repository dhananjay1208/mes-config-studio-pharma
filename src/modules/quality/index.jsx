import React, { useMemo, useState } from 'react';
import { Plus, AlertTriangle, Wand2, ChevronDown, ChevronRight } from 'lucide-react';
import { useStudio, useStudioDispatch } from '../../engine/StudioContext.jsx';
import { setConfig } from '../../engine/actions.js';
import { useModuleTab } from '../../components/config/useModuleTab.js';
import { allMachinesInFlow } from '../../engine/selectors.js';
import { validateQuality } from '../../engine/validate.js';
import EditableTable from '../../components/config/EditableTable.jsx';
import RuleRow, { RuleNum, RuleSelect } from '../../components/config/RuleRow.jsx';

const TABS = [
  ['catalog', 'Defect Catalog'],
  ['plans', 'Inspection Plans'],
  ['containment', 'Containment'],
];

const REACTIONS = [
  { value: 'record', label: 'Record only' },
  { value: 'andon', label: 'Raise andon' },
  { value: 'hold', label: 'Hold cases' },
];

const SOURCES = [
  { value: 'inlineGauge', label: 'IPC auto-tester (SPC)' },
  { value: 'camera', label: 'Camera / vision' },
  { value: 'checkweigher', label: 'Checkweigher' },
  { value: 'patrol', label: 'Patrol / roving QA' },
  { value: 'firstOff', label: 'Line clearance + first-off (after changeover)' },
];

const AREAS = [
  { value: 'maker', label: 'Tablet press' },
  { value: 'reservoir', label: 'Coater' },
  { value: 'packer', label: 'Blister machine' },
  { value: 'cartoner', label: 'Cartoner / serialization' },
  { value: 'casePacker', label: 'Case packer' },
  { value: 'palletizer', label: 'Palletizer' },
  { value: 'dryer', label: 'Granulation suite' },
];

export default function QualityModule() {
  const state = useStudio();
  const dispatch = useStudioDispatch();
  const [tab, setTab] = useModuleTab('catalog');
  const findings = useMemo(() => validateQuality(state.config), [state.config]);
  const q = state.config.quality;

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

      {tab === 'catalog' && (
        <div className="panel p-4">
          <p className="mb-3 text-xs text-slate-500">
            The platform ships a starter catalog; extend it with what this plant actually produces. Matching
            during the run is by CODE — rename freely, but do not renumber what already exists.
          </p>
          <EditableTable
            columns={[
              { key: 'code', label: 'Code', type: 'text', mono: true, width: 130 },
              { key: 'desc', label: 'Description', type: 'text' },
              { key: 'area', label: 'Area', type: 'select', width: 140, options: AREAS },
              { key: 'severity', label: 'Severity (1–3)', type: 'number', mono: true, width: 120 },
            ]}
            rows={q.defectCatalog}
            onChange={(i, key, value) => dispatch(setConfig(['quality', 'defectCatalog'],
              q.defectCatalog.map((d, idx) => (idx === i ? { ...d, [key]: value } : d))))}
            onAdd={() => dispatch(setConfig(['quality', 'defectCatalog'],
              [...q.defectCatalog, { code: '', desc: '', area: 'maker', severity: 1 }]))}
            onDelete={(i) => dispatch(setConfig(['quality', 'defectCatalog'], q.defectCatalog.filter((_, idx) => idx !== i)))}
            addLabel="Add defect code"
          />
          <p className="mt-3 text-[11px] text-slate-500">
            Severity drives containment: 3 = patient safety / regulatory (metal, UI failure, missing leaflet,
            potent cross-contamination), 2 = specification (weight, hardness, LOD, short case), 1 = cosmetic.
          </p>
        </div>
      )}

      {tab === 'plans' && <PlansTab state={state} dispatch={dispatch} />}

      {tab === 'containment' && (
        <div className="panel space-y-2 p-4">
          <p className="mb-2 text-xs text-slate-500">
            What happens when an inspection FINDS something. Without a rule, a recorded defect still ships —
            detection and containment are two different projects.
          </p>
          {q.containment.map((r, i) => (
            <RuleRow key={r.id ?? i} onDelete={() => dispatch(setConfig(['quality', 'containment'], q.containment.filter((_, xi) => xi !== i)))}>
              <span>defects with severity ≥</span>
              <RuleNum value={r.minSeverity} min={1} max={3}
                onChange={(v) => dispatch(setConfig(['quality', 'containment'], q.containment.map((x, xi) => (xi === i ? { ...x, minSeverity: v } : x))))} />
              <span>→</span>
              <RuleSelect value={r.action} width="w-56"
                options={[
                  { value: 'holdCases', label: 'Hold the cases' },
                  { value: 'blockUiRange', label: 'Block the UI range' },
                  { value: 'quarantineLot', label: 'Quarantine the lot' },
                ]}
                onChange={(v) => dispatch(setConfig(['quality', 'containment'], q.containment.map((x, xi) => (xi === i ? { ...x, action: v } : x))))} />
            </RuleRow>
          ))}
          {q.containment.length === 0 && (
            <p className="py-4 text-center text-xs text-slate-600">No containment rules — every detected defect ships anyway.</p>
          )}
          <button className="btn-ghost !py-1.5 text-xs"
            onClick={() => dispatch(setConfig(['quality', 'containment'],
              [...q.containment, { id: `CT-${q.containment.length + 1}`, minSeverity: 3, action: 'holdCases' }]))}>
            <Plus className="h-3.5 w-3.5" /> Add containment rule
          </button>
          <p className="pt-2 text-[11px] text-slate-500">
            Hold the cases keeps product in quarantine; block the serial pool stops those identities being uploaded
            as released; quarantine the lot pulls the blend IBC out of the next batch.
          </p>
        </div>
      )}

      <div className="panel p-4">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="panel-title !text-slate-300">Configuration checks ({findings.length})</span>
        </div>
        {findings.length === 0 ? (
          <p className="text-xs text-emerald-400">Detection sits where the defects are made, and containment stops what it finds.</p>
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
function PlansTab({ state, dispatch }) {
  const q = state.config.quality;
  const plans = q.inspectionPlans;
  const machines = allMachinesInFlow(state.config);
  const [openId, setOpenId] = useState(null);

  const commit = (next) => dispatch(setConfig(['quality', 'inspectionPlans'], next));
  const machineByCode = (code) => state.config.plantModel.nodes.find(
    (n) => (n.type === 'machine' || n.type === 'buffer') && n.code === code) ?? null;

  const pr3 = machineByCode('PR3');
  const pr5 = machineByCode('PR5');
  const cp1 = machineByCode('CP1');
  const canSeed = Boolean(pr3 && pr5 && cp1);

  const seed = () => {
    if (!canSeed) return;
    commit([
      { id: 'IP-PR3-SPC', machineId: pr3.id, source: 'inlineGauge', n: 1, checks: [
        { characteristic: 'tabletWeight', spec: '250 mg ± 5 %', reaction: 'andon' },
        { characteristic: 'hardness', spec: '80–140 N', reaction: 'hold' },
      ] },
      { id: 'IP-PR5-SPC', machineId: pr5.id, source: 'inlineGauge', n: 1, checks: [
        { characteristic: 'tabletWeight', spec: 'SKU target ± 5 %', reaction: 'andon' },
        { characteristic: 'hardness', spec: '80–140 N', reaction: 'hold' },
      ] },
      { id: 'IP-PR3-FO', machineId: pr3.id, source: 'firstOff', n: 1, checks: [
        { characteristic: 'line clearance + first-off (identity, appearance, residue swab)', spec: 'no residue, correct blend lot, eBR opened', reaction: 'hold' },
      ] },
      { id: 'IP-PR5-FO', machineId: pr5.id, source: 'firstOff', n: 1, checks: [
        { characteristic: 'line clearance + first-off (identity, appearance, residue swab)', spec: 'no residue, correct blend lot, eBR opened', reaction: 'hold' },
      ] },
      { id: 'IP-CP1-CW', machineId: cp1.id, source: 'checkweigher', n: 1, checks: [
        { characteristic: 'caseWeight', spec: '20 bundles (200 cartons) — 5.4 kg ± 2 %', reaction: 'hold' },
      ] },
    ]);
  };

  const patchPlan = (pi, key, value) => commit(plans.map((p, i) => (i === pi ? { ...p, [key]: value } : p)));
  const patchChecks = (planId, checks) => commit(plans.map((p) => (p.id === planId ? { ...p, checks } : p)));

  return (
    <div className="space-y-3">
      <div className="panel space-y-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs text-slate-500">
            Detection is placement: SPC on the presses where weight and hardness are made, line clearance and
            first-off after every changeover, the checkweigher where a short case is still cheap to catch.
          </p>
          <button className="btn-ghost shrink-0 !py-1.5 text-xs" onClick={seed} disabled={!canSeed}>
            <Wand2 className="h-3.5 w-3.5" /> Seed recommended plans
          </button>
        </div>
        {!canSeed && (
          <p className="text-[11px] text-amber-400">
            The recommended set needs PR3, PR5 and CP1 in the plant model — add the standard lines and the
            finishing area in Plant Modeler first.
          </p>
        )}

        <EditableTable
          columns={[
            { key: '_open', label: '', type: 'readonly', width: 36,
              render: (row) => (
                <button className="text-slate-500 hover:text-violet-300" onClick={() => setOpenId(openId === row.id ? null : row.id)}>
                  {openId === row.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) },
            { key: 'id', label: 'Plan', type: 'readonly', mono: true, width: 120 },
            { key: 'machineId', label: 'Machine', type: 'select', width: 230,
              options: machines.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` })) },
            { key: 'source', label: 'Source', type: 'select', width: 200, options: SOURCES },
            { key: 'n', label: 'Sample 1-in-n', type: 'number', mono: true, width: 120 },
            { key: '_checks', label: 'Checks', type: 'readonly', width: 80,
              render: (row) => (
                <span className={`mono text-xs ${(row.checks ?? []).length === 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                  {(row.checks ?? []).length}
                </span>
              ) },
          ]}
          rows={plans}
          onChange={(i, key, value) => patchPlan(i, key, value)}
          onAdd={() => commit([...plans, { id: `IP-${plans.length + 1}`, machineId: '', source: 'patrol', n: 1, checks: [] }])}
          onDelete={(i) => commit(plans.filter((_, idx) => idx !== i))}
          addLabel="Add inspection plan"
          emptyText="No inspection plans — every injected defect ships unchallenged."
        />
        <p className="text-[11px] text-slate-500">
          Cross-module note: IPC and checkweigher plans only see data if the tag is mapped in Shopfloor
          Connectivity. A plan pointed at an unmapped signal inspects nothing, silently.
        </p>
      </div>

      {plans.filter((p) => p.id === openId).map((plan) => {
        const machine = machines.find((m) => m.id === plan.machineId);
        return (
          <div key={plan.id} className="panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="mono text-sm font-bold text-violet-300">{plan.id}</span>
              <span className="text-sm text-slate-400">{machine ? `${machine.code} — ${machine.name}` : 'no machine selected'}</span>
              <span className="chip bg-plant-800 !px-2 !py-0.5 text-slate-400">
                {SOURCES.find((s) => s.value === plan.source)?.label ?? plan.source}
              </span>
            </div>
            <EditableTable
              columns={[
                { key: 'characteristic', label: 'Characteristic', type: 'text' },
                { key: 'spec', label: 'Specification', type: 'text' },
                { key: 'reaction', label: 'On failure', type: 'select', width: 150, options: REACTIONS },
              ]}
              rows={plan.checks ?? []}
              onChange={(ci, key, value) => patchChecks(plan.id,
                (plan.checks ?? []).map((c, j) => (j === ci ? { ...c, [key]: value } : c)))}
              onAdd={() => patchChecks(plan.id, [...(plan.checks ?? []), { characteristic: '', spec: '', reaction: 'record' }])}
              onDelete={(ci) => patchChecks(plan.id, (plan.checks ?? []).filter((_, j) => j !== ci))}
              addLabel="Add check"
              emptyText="No checks — this plan inspects nothing."
            />
            <p className="mt-2 text-[11px] text-slate-500">
              Name the characteristic honestly: an IPC plan whose characteristic mentions "hardness"
              reads the hardness tag; otherwise it reads tablet weight.
            </p>
          </div>
        );
      })}
    </div>
  );
}
