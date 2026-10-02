import React, { useMemo, useState } from 'react';
import { Globe, Factory, Warehouse, Rows3, Cpu, Database, Cylinder, LayoutTemplate, AlertTriangle } from 'lucide-react';
import { useStudio, useStudioDispatch } from '../../engine/StudioContext.jsx';
import { setConfig } from '../../engine/actions.js';
import { useModuleTab } from '../../components/config/useModuleTab.js';
import { deriveFlow, nodeById, linesOfPlant, silosOf } from '../../engine/selectors.js';
import { validatePlantModel } from '../../engine/validate.js';
import TreeView from '../../components/config/TreeView.jsx';
import PropertyPanel from '../../components/config/PropertyPanel.jsx';
import FlowStrip from '../../components/config/FlowStrip.jsx';
import EditableTable from '../../components/config/EditableTable.jsx';
import { PRODUCT_SPEC, LINE_TEMPLATES, SILO_TEMPLATES } from '../../data/customer.js';
import { addChild, deleteCascade, moveSibling, updateNode, applyLineTemplate, applySiloTemplates } from '../../engine/plantOps.js';

// Engine machine classes keep their internal names (maker / reservoir /
// packer / cartoner); the labels are the pharma plant's words.
const TYPE_META = {
  enterprise: { icon: Globe, label: 'Enterprise', color: 'text-sky-400', childTypes: [] },
  site: { icon: Factory, label: 'Site', color: 'text-sky-400', childTypes: ['area'] },
  area: { icon: Warehouse, label: 'Area', color: 'text-violet-400', childTypes: ['line', 'silo'] },
  line: { icon: Rows3, label: 'Line', color: 'text-emerald-400', childTypes: ['machine', 'buffer'] },
  machine: { icon: Cpu, label: 'Machine', color: 'text-slate-300', childTypes: [] },
  buffer: { icon: Database, label: 'Coater + coated-bulk hold', color: 'text-amber-400', childTypes: [] },
  silo: { icon: Cylinder, label: 'IBC', color: 'text-amber-400', childTypes: [] },
};

const AREA_CLASS_OPTIONS = [
  { value: 'upstream', label: 'Granulation Suite (batch)' },
  { value: 'primaryFeed', label: 'Blend Supply (IBC fleet)' },
  { value: 'secondary', label: 'Compression, Coating & Packaging Lines' },
  { value: 'finishing', label: 'Case Packing & Palletizing' },
];

const MACHINE_CLASS_OPTIONS = [
  { value: 'maker', label: 'Tablet press' },
  { value: 'packer', label: 'Blister machine' },
  { value: 'cartoner', label: 'Cartoner + serialization station' },
  { value: 'casePacker', label: 'Case packer' },
  { value: 'palletizer', label: 'Palletizer' },
  { value: 'dispensary', label: 'Dispensary (weigh & dispense)' },
  { value: 'granulator', label: 'High-shear granulator' },
  { value: 'dryer', label: 'Fluid-bed dryer' },
  { value: 'mill', label: 'Mill / sizer' },
  { value: 'blender', label: 'Final blender' },
  { value: 'kitchen', label: 'Coating kitchen' },
];

const SPEED_FIELD = {
  maker: { key: 'ratedTabletsMin', label: 'Rated speed (tablets/min)' },
  packer: { key: 'ratedBlistersMin', label: 'Rated speed (blisters/min)' },
  cartoner: { key: 'ratedCartonsMin', label: 'Rated speed (cartons/min)' },
  casePacker: { key: 'ratedCasesMin', label: 'Rated speed (cases/min)' },
  palletizer: { key: 'ratedCasesMin', label: 'Rated speed (cases/min)' },
};

const BLEND_OPTIONS = PRODUCT_SPEC.blends.map((b) => ({ value: b.code, label: `${b.code} — ${b.name}` }));

const PRIMARY_AREA = { name: 'Blend Supply (IBC fleet)', code: 'PRIM', areaClass: 'primaryFeed' };

function fieldsForNode(node) {
  const base = [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'code', label: 'Code', type: 'text', help: 'Short identifier used across the platform.' },
  ];
  switch (node.type) {
    case 'area':
      return [...base, {
        key: 'areaClass', label: 'Area class', type: 'select', options: AREA_CLASS_OPTIONS,
        help: 'Tells the engine what this area IS. IBC supply, line routing and finishing all key off this.',
      }];
    case 'line':
      return [...base, {
        key: 'potentCapable', label: 'Potent-segregated', type: 'toggle',
        help: 'Potent segregation — only a segregated line (own coater, own IBCs) may legally run a potent SKU such as Zentrix 50 mg.',
      }];
    case 'machine': {
      const fields = [...base, {
        key: 'machineClass', label: 'Machine class', type: 'select', options: MACHINE_CLASS_OPTIONS,
        help: 'What the engine treats this machine as. Signals, OEE and aggregation all key off this.',
      }];
      const speed = SPEED_FIELD[node.props.machineClass];
      if (speed) {
        fields.push({
          key: speed.key, label: speed.label, type: 'number',
          help: 'Drives the case rate the engine runs at — 4,000 tablets/min, 400 blisters/min or 200 cartons/min is exactly 1 case/min.',
        });
      }
      return fields;
    }
    case 'buffer':
      return [...base, {
        key: 'bufferMin', label: 'Coated-bulk hold (minutes of packaging demand)', type: 'number',
        help: 'How long the blister line can keep packing from staged coated bulk while the press is down — and how long the press keeps filling drums while the blister is down. Coated tablets wait in drums; press and blister are not one machine.',
      }];
    case 'silo':
      return [...base,
        { key: 'blendCode', label: 'Blend lot family', type: 'select', options: BLEND_OPTIONS,
          help: 'What this IBC holds — the blend-availability check reads exactly this.' },
        { key: 'capacityKg', label: 'Capacity (kg)', type: 'number' },
        { key: 'startLevelKg', label: 'Released quantity (kg)', type: 'number',
          help: 'Released blend at 06:00 — the granulation suite refills the IBC fleet overnight. 1 kg of 250 mg blend = 4,000 tablets = 1 case.' },
      ];
    default:
      return base;
  }
}

export default function PlantModelModule() {
  const state = useStudio();
  const dispatch = useStudioDispatch();
  const nodes = state.config.plantModel.nodes;
  const [selectedId, setSelectedId] = useState('SITE-HP2');
  const [tab, setTab] = useModuleTab('tree');

  const site = nodes.find((n) => n.type === 'site');
  const root = nodes.find((n) => n.type === 'enterprise');
  const selected = nodeById(nodes, selectedId) ?? site;
  const flow = useMemo(() => deriveFlow(state.config), [state.config]);
  const findings = useMemo(() => validatePlantModel(state.config), [state.config]);
  const lineCodes = useMemo(() => linesOfPlant(state.config).map((L) => L.line.code), [state.config]);

  const commit = (newNodes) => dispatch(setConfig(['plantModel', 'nodes'], newNodes));

  const handlePropChange = (key, value) => {
    if (!selected) return;
    const patch = key === 'name' || key === 'code' ? { [key]: value } : { props: { [key]: value } };
    commit(updateNode(nodes, selected.id, patch));
  };

  const toggleFeed = (siloId, code) => {
    const silo = nodeById(nodes, siloId);
    if (!silo) return;
    const cur = silo.props.feedsLineCodes ?? [];
    const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
    commit(updateNode(nodes, siloId, { props: { feedsLineCodes: next } }));
  };

  const lineExists = (tpl) => nodes.some((n) => n.type === 'line' && n.code === tpl.line.code);
  const silosDone = SILO_TEMPLATES.every((s) => nodes.some((n) => n.type === 'silo' && n.code === s.code));

  const LINE_BUTTONS = [
    ['Add Line 3', LINE_TEMPLATES.line3],
    ['Add Line 5 (potent, segregated)', LINE_TEMPLATES.line5],
    ['Add Granulation Suite', LINE_TEMPLATES.upstream],
    ['Add Finishing', LINE_TEMPLATES.finishing],
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex flex-wrap gap-1">
        {[['tree', 'Tree & Properties'], ['flow', 'Flow'], ['feed', 'Blend Supply']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${
              tab === id ? 'bg-violet-600/20 text-violet-300' : 'text-slate-500 hover:bg-plant-800 hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'tree' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-4">
            {/* Templates */}
            <div className="panel p-4">
              <div className="mb-2 flex items-center gap-2">
                <LayoutTemplate className="h-4 w-4 text-violet-400" />
                <span className="panel-title !text-slate-300">Insert standard structures</span>
              </div>
              <p className="mb-3 text-[11px] text-slate-500">
                Platform accelerators — insert a standard line, the granulation suite or the IBC fleet, then adjust
                them. (Real platforms ship libraries exactly like this.)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {LINE_BUTTONS.map(([label, tpl]) => (
                  <button
                    key={label}
                    disabled={!site || lineExists(tpl)}
                    onClick={() => commit(applyLineTemplate(nodes, site.id, tpl))}
                    className="btn-ghost !px-2.5 !py-1 text-xs"
                  >
                    + {label}
                  </button>
                ))}
                <button
                  disabled={!site || silosDone}
                  onClick={() => commit(applySiloTemplates(nodes, site.id, SILO_TEMPLATES, PRIMARY_AREA))}
                  className="btn-ghost !px-2.5 !py-1 text-xs"
                >
                  + Add the 4 IBCs
                </button>
              </div>
            </div>

            {/* Tree */}
            <div className="panel p-3">
              <TreeView
                nodes={nodes}
                rootId={root?.id}
                selectedId={selected?.id}
                onSelect={setSelectedId}
                typeMeta={TYPE_META}
                onAddChild={(parentId, type) => {
                  const { nodes: next, id } = addChild(nodes, parentId, type);
                  commit(next);
                  setSelectedId(id);
                }}
                onDelete={(id) => {
                  commit(deleteCascade(nodes, id));
                  if (selectedId === id) setSelectedId(site?.id);
                }}
                canDelete={(n) => n.type !== 'enterprise' && n.type !== 'site'}
                onMove={(id, dir) => commit(moveSibling(nodes, id, dir))}
              />
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {selected && (
              <PropertyPanel
                title={`${TYPE_META[selected.type]?.label ?? selected.type} properties`}
                subtitle={selected.id}
                fields={fieldsForNode(selected)}
                values={{ name: selected.name, code: selected.code, ...selected.props }}
                onChange={handlePropChange}
              />
            )}

            {selected?.type === 'silo' && (
              <div className="panel p-4">
                <div className="panel-title mb-2">May dock on</div>
                {lineCodes.length === 0 ? (
                  <p className="text-xs text-amber-400">No lines yet — add Line 3 / Line 5 first.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {lineCodes.map((code) => {
                      const active = (selected.props.feedsLineCodes ?? []).includes(code);
                      return (
                        <button
                          key={code}
                          onClick={() => toggleFeed(selected.id, code)}
                          className={`chip !px-2.5 !py-1 !text-[11px] transition-colors ${
                            active ? 'bg-violet-600/25 text-violet-200 ring-1 ring-violet-500' : 'bg-plant-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {code}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="mt-2 text-[11px] text-slate-500">
                  A line can only run what an IBC allowed to dock on its press can feed — the docking / potent
                  segregation feasibility check reads exactly this list.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'flow' && (
        <div className="panel p-4">
          <div className="panel-title mb-3">Derived production flow</div>
          <FlowStrip flow={flow} />
          <p className="mt-3 text-[11px] text-slate-500">
            This flow is derived from your hierarchy: site children in order — Granulation Suite, Blend Supply,
            Lines, Finishing. The run engine walks exactly this route; if the order looks wrong here, use the
            tree's move arrows.
          </p>
        </div>
      )}

      {tab === 'feed' && (
        <PrimaryFeedTab
          config={state.config}
          nodes={nodes}
          lineCodes={lineCodes}
          commit={commit}
          onToggleFeed={toggleFeed}
        />
      )}

      {/* Findings */}
      <div className="panel p-4">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="panel-title !text-slate-300">Configuration checks ({findings.length})</span>
        </div>
        {findings.length === 0 ? (
          <p className="text-xs text-emerald-400">Plant model is complete and routable.</p>
        ) : (
          <ul className="space-y-1.5">
            {findings.map((f) => (
              <li key={f.id} className={`text-[11px] leading-snug ${f.level === 'error' ? 'text-red-400' : 'text-amber-400/90'}`}>
                • {f.msg}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blend Supply — the IBC table (the batch side as a constraint feed)
// ---------------------------------------------------------------------------
function PrimaryFeedTab({ config, nodes, lineCodes, commit, onToggleFeed }) {
  const silos = silosOf(config);
  const primaryArea = nodes.find((n) => n.type === 'area' && n.props.areaClass === 'primaryFeed');

  const patchSilo = (i, key, value) => {
    const silo = silos[i];
    if (!silo) return;
    const patch = key === 'code' || key === 'name' ? { [key]: value } : { props: { [key]: value } };
    commit(updateNode(nodes, silo.id, patch));
  };

  const rows = silos.map((s) => ({
    id: s.id, code: s.code, name: s.name,
    blendCode: s.props.blendCode, capacityKg: s.props.capacityKg, startLevelKg: s.props.startLevelKg,
    feedsLineCodes: s.props.feedsLineCodes ?? [],
  }));

  const columns = [
    { key: 'code', label: 'IBC', type: 'text', mono: true, width: 90 },
    { key: 'name', label: 'Blend lot', type: 'text' },
    { key: 'blendCode', label: 'Blend', type: 'select', width: 210, options: BLEND_OPTIONS },
    { key: 'capacityKg', label: 'Capacity kg', type: 'number', mono: true, width: 95 },
    { key: 'startLevelKg', label: 'Released kg', type: 'number', mono: true, width: 95 },
    { key: 'feedsLineCodes', label: 'May dock on', width: 150, render: (row) => (
      <div className="flex flex-wrap gap-1">
        {lineCodes.length === 0 && <span className="text-[10px] italic text-slate-600">no lines yet</span>}
        {lineCodes.map((code) => (
          <button
            key={code}
            onClick={() => onToggleFeed(row.id, code)}
            className={`chip !px-2 !py-0.5 !text-[10px] transition-colors ${
              row.feedsLineCodes.includes(code)
                ? 'bg-violet-600/25 text-violet-200 ring-1 ring-violet-500'
                : 'bg-plant-800 text-slate-500 hover:text-slate-200'
            }`}
          >
            {code}
          </button>
        ))}
      </div>
    ) },
  ];

  return (
    <div className="panel space-y-3 p-5">
      <div className="panel-title !text-slate-300">IBC fleet (Blend Supply)</div>
      <EditableTable
        columns={columns}
        rows={rows}
        onChange={patchSilo}
        onAdd={primaryArea ? () => commit(addChild(nodes, primaryArea.id, 'silo').nodes) : undefined}
        onDelete={(i) => commit(deleteCascade(nodes, silos[i].id))}
        addLabel="Add IBC"
        emptyText="No IBCs modeled — the presses have no blend supply. Use the template button on the Tree tab."
      />
      <p className="text-[11px] text-slate-500">
        The batch side, modeled as a constraint feed: a press can only run what an IBC allowed to dock on it
        holds as released blend. Blend availability and docking rules in APS Integration read exactly this
        table — a line with no IBC starves from minute one, and a potent IBC on the wrong press is a
        cross-contamination, not a scheduling problem.
      </p>
    </div>
  );
}
