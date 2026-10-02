import React, { useMemo, useState } from 'react';
import { Sparkles, PackagePlus, Wand2, Barcode, AlertTriangle } from 'lucide-react';
import { useStudio, useStudioDispatch } from '../../engine/StudioContext.jsx';
import { setConfig } from '../../engine/actions.js';
import { useModuleTab } from '../../components/config/useModuleTab.js';
import { validateMaterials } from '../../engine/validate.js';
import EditableTable from '../../components/config/EditableTable.jsx';
import { PRODUCT_SPEC, MATERIAL_CATALOG, UI_RANGE_SPEC } from '../../data/customer.js';
import { standardBomLines } from '../../data/presets.js';

const TABS = [
  ['skus', 'SKUs & Blends'],
  ['materials', 'Materials'],
  ['bom', 'BOMs'],
  ['ranges', 'Serial Pools & Vignettes'],
];

const FORMAT_OPTIONS = [
  { value: 'T11', label: 'T11 — 11 mm round tooling' },
  { value: 'T4', label: 'T4 — 4 mm mini-tablet multi-tip' },
];

const MARKET_OPTIONS = [
  { value: 'DOM', label: 'DOM — domestic' },
  { value: 'EXP', label: 'EXP — export (Italy)' },
];

const MATERIAL_TYPE_OPTIONS = [
  { value: 'blend', label: 'Final blend (IBC)' },
  { value: 'coatingSusp', label: 'Coating suspension' },
  { value: 'film', label: 'Blister forming film' },
  { value: 'foil', label: 'Lidding foil' },
  { value: 'carton', label: 'Carton blank' },
  { value: 'leaflet', label: 'Patient leaflet' },
  { value: 'tamper', label: 'Anti-tamper seal' },
  { value: 'vignette', label: 'Reimbursement vignette' },
  { value: 'bundleFilm', label: 'Bundle shrink film' },
  { value: 'label', label: 'Label stock' },
  { value: 'caseBlank', label: 'Case blank' },
];

const SPEC_SKU_CODES = new Set(PRODUCT_SPEC.skus.map((s) => s.code));

export default function MaterialsModule() {
  const state = useStudio();
  const dispatch = useStudioDispatch();
  const { materials } = state.config;
  const [tab, setTab] = useModuleTab('skus');
  const findings = useMemo(() => validateMaterials(state.config), [state.config]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {TABS.map(([id, label]) => (
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

      {tab === 'skus' && <SkuDesigner materials={materials} dispatch={dispatch} />}
      {tab === 'materials' && <MaterialsTable materials={materials} dispatch={dispatch} />}
      {tab === 'bom' && <BomEditor materials={materials} dispatch={dispatch} />}
      {tab === 'ranges' && <UiRanges materials={materials} dispatch={dispatch} />}

      <div className="panel p-4">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="panel-title !text-slate-300">Configuration checks ({findings.length})</span>
        </div>
        {findings.length === 0 ? (
          <p className="text-xs text-emerald-400">Master data covers the customer's full product offer.</p>
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
// SKUs & blends — the sellable portfolio the plant must be able to build
// ---------------------------------------------------------------------------
function SkuDesigner({ materials, dispatch }) {
  const skus = materials.skus;
  const blends = materials.blends;
  const commitSkus = (next) => dispatch(setConfig(['materials', 'skus'], next));
  const commitBlends = (next) => dispatch(setConfig(['materials', 'blends'], next));

  const importBrief = () => {
    commitSkus(PRODUCT_SPEC.skus.map((s) => ({ ...s })));
    commitBlends(PRODUCT_SPEC.blends.map((b) => ({ ...b })));
  };

  const blendOptions = blends.map((b) => ({ value: b.code, label: `${b.code} — ${b.name}` }));

  const skuColumns = [
    { key: 'code', label: 'SKU code', width: 110, render: (row, i) => (
      SPEC_SKU_CODES.has(row.code) ? (
        <span className="mono px-1 text-slate-400">{row.code}</span>
      ) : (
        <input
          className="mono w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm text-slate-200 outline-none hover:border-slate-600 focus:border-violet-500"
          value={row.code ?? ''}
          onChange={(e) => commitSkus(skus.map((s, idx) => (idx === i ? { ...s, code: e.target.value } : s)))}
        />
      )
    ) },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'family', label: 'Family (API)', type: 'text', mono: true, width: 90 },
    { key: 'format', label: 'Tooling', type: 'select', width: 190, options: FORMAT_OPTIONS },
    { key: 'blendCode', label: 'Blend', type: 'select', width: 190, options: blendOptions },
    { key: 'potent', label: 'Potent', type: 'toggle', width: 65 },
    { key: 'market', label: 'Market', type: 'select', width: 150, options: MARKET_OPTIONS },
    { key: 'gtin', label: 'GTIN-14', type: 'text', mono: true, width: 140 },
    { key: 'targetTabletWeightMg', label: 'Weight mg', type: 'number', mono: true, width: 85 },
    { key: 'targetHardnessN', label: 'Hardness N', type: 'number', mono: true, width: 90 },
  ];

  const blendColumns = [
    { key: 'code', label: 'Blend code', type: 'text', mono: true, width: 130 },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'family', label: 'Family (API)', type: 'text', mono: true, width: 100 },
    { key: 'potent', label: 'Potent', type: 'toggle', width: 80 },
  ];

  return (
    <div className="panel space-y-5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <span className="panel-title !text-slate-300">Sellable portfolio</span>
        </div>
        <p className="flex-1 text-xs text-slate-500">
          Five SKUs across three product families, two tooling sets and two markets. Only a configured SKU can be
          ordered, scheduled and packed — everything else is rejected at the interface. The family (API) decides
          whether a changeover is a 20-minute line clearance or a 2-hour product change with a clean.
        </p>
        <button onClick={importBrief} className="btn-ghost !py-1 text-xs">
          Import from customer brief
        </button>
      </div>

      <EditableTable
        columns={skuColumns}
        rows={skus.map((s) => ({ ...s, id: s.code }))}
        onChange={(i, key, value) => commitSkus(skus.map((s, idx) => (idx === i ? { ...s, [key]: value } : s)))}
        onAdd={() => commitSkus([...skus, {
          code: '', name: '', family: '', format: 'T11', blendCode: '', potent: false, market: 'DOM', gtin: '',
          tabletsPerCarton: 20, cartonsPerCase: 200, targetTabletWeightMg: 250, targetHardnessN: 0,
        }])}
        onDelete={(i) => commitSkus(skus.filter((_, idx) => idx !== i))}
        addLabel="Add SKU"
        emptyText="No SKUs — no order can be validated and no run can be packed."
      />

      <div>
        <div className="panel-title mb-2">Final blends the granulation suite can supply</div>
        <EditableTable
          columns={blendColumns}
          rows={blends.map((b) => ({ ...b, id: b.code }))}
          onChange={(i, key, value) => commitBlends(blends.map((b, idx) => (idx === i ? { ...b, [key]: value } : b)))}
          onAdd={() => commitBlends([...blends, { code: '', name: '', family: '', potent: false }])}
          onDelete={(i) => commitBlends(blends.filter((_, idx) => idx !== i))}
          addLabel="Add blend"
          emptyText="No blends — the IBCs have nothing to declare they hold."
        />
        <p className="mt-2 text-[11px] text-slate-500">
          The blend list mirrors what the IBC fleet can hold. Blends and tablets are visually indistinguishable
          across strengths — only data knows. A SKU whose blend no IBC may dock with is a run that starves at 06:00.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Materials master
// ---------------------------------------------------------------------------
function MaterialsTable({ materials, dispatch }) {
  const items = materials.items;
  const commit = (next) => dispatch(setConfig(['materials', 'items'], next));

  const catalogLeft = MATERIAL_CATALOG.filter((c) => !items.some((i) => i.id === c.id));

  const columns = [
    { key: 'code', label: 'Code', type: 'text', mono: true, width: 140 },
    { key: 'desc', label: 'Description', type: 'text' },
    { key: 'type', label: 'Type', type: 'select', width: 170, options: MATERIAL_TYPE_OPTIONS },
    { key: 'uom', label: 'UoM', type: 'text', width: 60, mono: true },
    { key: 'lotTracked', label: 'Lot', type: 'toggle', width: 50 },
    { key: 'market', label: 'Market', type: 'select', width: 150, options: MARKET_OPTIONS },
  ];

  let blankCounter = items.filter((i) => String(i.id).startsWith('MAT-')).length;

  return (
    <div className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <PackagePlus className="h-4 w-4 text-violet-400" />
          <span className="panel-title !text-slate-300">Customer material catalog</span>
        </div>
        <p className="flex-1 text-xs text-slate-500">
          Final blends by strength, coating suspensions, blister film and foil, cartons and leaflets by market,
          anti-tamper seals, the Italian reimbursement vignette, shrink film, labels, case blanks. Market-coded
          items are how export cartons stay export cartons. API and excipients enter through dispensing, not the BOM.
        </p>
        <button
          onClick={() => commit([...items, ...catalogLeft.map((c) => ({ ...c }))])}
          disabled={catalogLeft.length === 0}
          className="btn-ghost !py-1 text-xs"
        >
          Import material catalog ({catalogLeft.length})
        </button>
      </div>

      <EditableTable
        columns={columns}
        rows={items}
        onChange={(i, key, value) => commit(items.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)))}
        onAdd={() => commit([...items, {
          id: `MAT-${++blankCounter}`, code: '', desc: '', type: 'carton', uom: 'EA',
          lotTracked: true, market: null,
        }])}
        onDelete={(i) => commit(items.filter((_, idx) => idx !== i))}
        addLabel="Add material"
        emptyText="No materials yet — import the customer catalog above."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BOM editor — one BOM per SKU, with consuming machine class & usage rule
// ---------------------------------------------------------------------------
function BomEditor({ materials, dispatch }) {
  const [skuCode, setSkuCode] = useState('');
  const boms = materials.boms;
  const commit = (next) => dispatch(setConfig(['materials', 'boms'], next));

  const sku = materials.skus.find((s) => s.code === skuCode) ?? null;
  const bom = boms.find((b) => b.skuCode === skuCode) ?? null;

  const generate = () => {
    if (!sku) return;
    const next = { id: `BOM-${sku.code}`, skuCode: sku.code, lines: standardBomLines(sku) };
    commit(bom ? boms.map((b) => (b.skuCode === sku.code ? next : b)) : [...boms, next]);
  };

  const lineColumns = [
    { key: 'materialId', label: 'Material', type: 'select',
      options: materials.items.map((i) => ({ value: i.id, label: `${i.code} — ${i.desc}` })) },
    { key: 'qtyPerCase', label: 'Qty / case', type: 'number', mono: true, width: 90 },
    { key: 'consumedAtMachineClass', label: 'Consumed at', type: 'select', width: 210, options: [
      { value: 'maker', label: 'Tablet press' }, { value: 'reservoir', label: 'Coater' },
      { value: 'packer', label: 'Blister machine' }, { value: 'cartoner', label: 'Cartoner / bundler' },
      { value: 'casePacker', label: 'Case packer' },
    ] },
    { key: 'usageRule', label: 'Usage rule', type: 'select', width: 160, options: [
      { value: '', label: 'Always' },
      { value: 'market:DOM', label: 'Domestic only' },
      { value: 'market:EXP', label: 'Export only' },
      { value: 'potent', label: 'Potent SKUs only' },
    ] },
  ];

  const patchLines = (lines) => commit(boms.map((b) => (b.skuCode === skuCode ? { ...b, lines } : b)));

  return (
    <div className="panel space-y-4 p-5">
      <div>
        <div className="panel-title mb-2">SKU</div>
        {materials.skus.length === 0 ? (
          <p className="text-xs text-amber-400">Configure SKUs first (SKUs &amp; Blends tab).</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {materials.skus.map((s) => {
              const hasBom = boms.some((b) => b.skuCode === s.code && b.lines.length > 0);
              return (
                <button
                  key={s.code}
                  onClick={() => setSkuCode(s.code)}
                  className={`chip !px-2.5 !py-1 !text-[11px] normal-case tracking-normal transition-colors ${
                    skuCode === s.code
                      ? 'bg-violet-600/25 text-violet-200 ring-1 ring-violet-500'
                      : 'bg-plant-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {s.code}
                  <span className={`ml-1 ${hasBom ? 'text-emerald-400' : 'text-red-400/80'}`}>{hasBom ? '●' : '○'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {sku && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-slate-300">
              <span className="mono text-violet-300">{sku.code}</span> · {sku.name} · {sku.format} · {sku.blendCode} · {sku.market}
            </div>
            <button onClick={generate} className="btn-ghost ml-auto !py-1 text-xs">
              <Wand2 className="h-3.5 w-3.5" /> Generate standard BOM
            </button>
          </div>

          {bom ? (
            <EditableTable
              columns={lineColumns}
              rows={bom.lines.map((l, i) => ({ ...l, id: `${bom.id}-${i}` }))}
              onChange={(i, key, value) => patchLines(bom.lines.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)))}
              onAdd={() => patchLines([...bom.lines, { materialId: '', qtyPerCase: 1, consumedAtMachineClass: '', usageRule: '' }])}
              onDelete={(i) => patchLines(bom.lines.filter((_, idx) => idx !== i))}
              addLabel="Add BOM line"
              emptyText="Empty BOM — the packaging line would have no film, foil, cartons or leaflets to consume."
            />
          ) : (
            <button
              className="btn-primary"
              onClick={() => commit([...boms, { id: `BOM-${sku.code}`, skuCode: sku.code, lines: [] }])}
            >
              Create BOM for {sku.code}
            </button>
          )}

          <p className="text-[11px] text-slate-500">
            One case = 20 bundles = 200 cartons = 400 blisters = 4,000 tablets (1 kg of 250 mg blend), so
            carton-level materials are 200 per case, blister-level 400 and bundle-level 20. “Consumed at” places
            both the material demand and its lot capture at a machine class — a line with no consuming machine
            has nothing to scan.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Serial-number pools — the identifiers the serialization station prints
// (and the export trap)
// ---------------------------------------------------------------------------
function UiRanges({ materials, dispatch }) {
  const ranges = materials.uiRanges;
  const commit = (next) => dispatch(setConfig(['materials', 'uiRanges'], next));

  const requestRanges = () => {
    const missing = UI_RANGE_SPEC.filter((r) => !ranges.some((x) => x.id === r.id));
    commit([...ranges, ...missing.map((r) => ({ ...r, assignedSkus: [] }))]);
  };

  const toggleSku = (rangeId, code) => {
    commit(ranges.map((r) => {
      if (r.id !== rangeId) return r;
      const cur = r.assignedSkus ?? [];
      return { ...r, assignedSkus: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code] };
    }));
  };

  const columns = [
    { key: 'id', label: 'Pool id', type: 'text', mono: true, width: 130 },
    { key: 'market', label: 'Market', type: 'select', width: 150, options: MARKET_OPTIONS },
    { key: 'rangeStart', label: 'First serial', type: 'text', mono: true, width: 190 },
    { key: 'size', label: 'Size (serials)', type: 'number', mono: true, width: 110 },
    { key: 'issuerId', label: 'Allocated by', type: 'readonly', mono: true, width: 110 },
  ];

  return (
    <div className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Barcode className="h-4 w-4 text-violet-400" />
          <span className="panel-title !text-slate-300">Serial-number pools (FMD unique identifiers)</span>
        </div>
        <p className="flex-1 text-xs text-slate-500">
          The L4 serialization provider allocates a pool of randomised serials (≤ 20 alphanumeric) per market;
          the site serialization manager HP2-SER hands them to the cartoner. Every carton UI = GTIN + serial +
          batch + expiry (+ the national reimbursement number for Italy). The MES never invents a serial.
        </p>
        <button onClick={requestRanges} className="btn-ghost !py-1 text-xs">Request pools from the L4 provider</button>
      </div>

      <EditableTable
        columns={columns}
        rows={ranges}
        onChange={(i, key, value) => commit(ranges.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))}
        onAdd={() => commit([...ranges, {
          id: `SNP-${ranges.length + 1}`, market: 'DOM', issuerId: 'SER-L4',
          rangeStart: '', size: 100000, assignedSkus: [],
        }])}
        onDelete={(i) => commit(ranges.filter((_, idx) => idx !== i))}
        addLabel="Add pool"
        emptyText="No serial pools — every carton would leave the cartoner legally anonymous."
      />

      <div className="space-y-3">
        {ranges.map((r) => {
          const eligible = materials.skus.filter((s) => s.market === r.market);
          return (
            <div key={r.id} className="rounded-lg border border-slate-700/70 bg-plant-900/60 px-3 py-2.5">
              <div className="mb-2 flex items-baseline gap-2">
                <span className="mono text-xs font-semibold text-violet-300">{r.id}</span>
                <span className="text-[11px] text-slate-500">assign {r.market} SKUs</span>
              </div>
              {eligible.length === 0 ? (
                <p className="text-[11px] text-amber-400">No {r.market} SKUs configured.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {eligible.map((s) => (
                    <button
                      key={s.code}
                      onClick={() => toggleSku(r.id, s.code)}
                      className={`chip !px-2.5 !py-1 !text-[11px] normal-case tracking-normal transition-colors ${
                        (r.assignedSkus ?? []).includes(s.code)
                          ? 'bg-violet-600/25 text-violet-200 ring-1 ring-violet-500'
                          : 'bg-plant-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {s.code}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-500">
        A pool only serves its own market. The export SKU with no EXP pool assigned cannot be serialized — and
        its cartons also need the Italian artwork, the Italian leaflet and the lot-tracked reimbursement vignette
        (bollino) in the BOM. Producing it anyway is a regulatory incident, not a warning.
      </p>
    </div>
  );
}
