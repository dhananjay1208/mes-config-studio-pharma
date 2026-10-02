// The model-answer configuration — what a senior consultant would configure.
// Used by: engine differential tests (good vs bad config), guided-mode
// acceptance fixtures, and the instructor's "load model answer" debrief tool.
import { emptyConfig } from '../engine/defaults.js';
import { applyLineTemplate, applySiloTemplates } from '../engine/plantOps.js';
import {
  LINE_TEMPLATES, SILO_TEMPLATES, PRODUCT_SPEC, MATERIAL_CATALOG,
  SIGNAL_DICTIONARY, DEVICE_CATALOG, UI_RANGE_SPEC,
} from './customer.js';
import { CORRECT_ERP_MAP, ORDER_FEED } from './erpFeed.js';
import { CORRECT_APS_MAP } from './apsFeed.js';

const PRIMARY_AREA = { name: 'Blend Supply (IBC fleet)', code: 'PRIM', areaClass: 'primaryFeed' };

// One BOM per SKU — every line-consumed material with the machine class that
// consumes it (per case = 200 cartons = 400 blisters = 4,000 tablets).
export function standardBomLines(sku) {
  const CTN_BY_SKU = {
    'CDX-10': 'CTN-CDX10-DOM', 'CDX-10-EXP': 'CTN-CDX10-EXP', 'CDX-20': 'CTN-CDX20',
    'ZTX-50': 'CTN-ZTX50', 'FEM-2.5': 'CTN-FEM25',
  };
  const LFT_BY_SKU = {
    'CDX-10': 'LFT-CDX-DOM', 'CDX-10-EXP': 'LFT-CDX-EXP', 'CDX-20': 'LFT-CDX-DOM',
    'ZTX-50': 'LFT-ZTX', 'FEM-2.5': 'LFT-FEM',
  };
  const kg = Number(sku.targetTabletWeightMg) > 0 ? (4000 * Number(sku.targetTabletWeightMg)) / 1e6 : 1;
  const lines = [
    { materialId: sku.blendCode ?? '', qtyPerCase: Math.round(kg * 1000) / 1000, consumedAtMachineClass: 'maker', usageRule: '' },
    { materialId: sku.potent ? 'CS-ZTX' : 'CS-CDX', qtyPerCase: 0.04, consumedAtMachineClass: 'reservoir', usageRule: '' },
    { materialId: 'FILM-PVDC', qtyPerCase: 400, consumedAtMachineClass: 'packer', usageRule: '' },
    { materialId: 'FOIL-AL', qtyPerCase: 400, consumedAtMachineClass: 'packer', usageRule: '' },
    { materialId: CTN_BY_SKU[sku.code] ?? '', qtyPerCase: 200, consumedAtMachineClass: 'cartoner', usageRule: `market:${sku.market}` },
    { materialId: LFT_BY_SKU[sku.code] ?? '', qtyPerCase: 200, consumedAtMachineClass: 'cartoner', usageRule: `market:${sku.market}` },
    { materialId: 'ATD-SEAL', qtyPerCase: 200, consumedAtMachineClass: 'cartoner', usageRule: '' },
  ];
  if (sku.market === 'EXP') {
    lines.push({ materialId: 'VIG-IT-CDX10', qtyPerCase: 200, consumedAtMachineClass: 'cartoner', usageRule: 'market:EXP' });
  }
  lines.push(
    { materialId: 'SHRINK-BN', qtyPerCase: 20, consumedAtMachineClass: 'cartoner', usageRule: '' },
    { materialId: 'LBL-BUNDLE', qtyPerCase: 20, consumedAtMachineClass: 'cartoner', usageRule: '' },
    { materialId: 'CASE-BLANK', qtyPerCase: 1, consumedAtMachineClass: 'casePacker', usageRule: '' },
    { materialId: 'LBL-CASE', qtyPerCase: 1, consumedAtMachineClass: 'casePacker', usageRule: '' },
  );
  return lines;
}

export function buildModelAnswerConfig() {
  const config = emptyConfig();
  const siteId = 'SITE-HP2';

  // --- Plant model: granulation suite, IBC fleet, both lines, finishing ---
  let nodes = config.plantModel.nodes;
  nodes = applyLineTemplate(nodes, siteId, LINE_TEMPLATES.upstream);
  nodes = applySiloTemplates(nodes, siteId, SILO_TEMPLATES, PRIMARY_AREA);
  for (const key of ['line3', 'line5', 'finishing']) {
    nodes = applyLineTemplate(nodes, siteId, LINE_TEMPLATES[key]);
  }
  config.plantModel.nodes = nodes;

  const machine = (code) => nodes.find((n) => (n.type === 'machine' || n.type === 'buffer') && n.code === code);
  const machineId = (code) => machine(code)?.id;

  // --- Products & materials -------------------------------------------------
  config.materials.skus = PRODUCT_SPEC.skus.map((s) => ({ ...s }));
  config.materials.blends = PRODUCT_SPEC.blends.map((b) => ({ ...b }));
  config.materials.items = MATERIAL_CATALOG.map((i) => ({ ...i }));
  config.materials.boms = PRODUCT_SPEC.skus.map((sku) => ({
    id: `BOM-${sku.code}`,
    skuCode: sku.code,
    lines: standardBomLines(sku),
  }));
  config.materials.uiRanges = UI_RANGE_SPEC.map((r) => ({
    ...r,
    assignedSkus: PRODUCT_SPEC.skus.filter((s) => s.market === r.market).map((s) => s.code),
  }));

  // --- Orders (ERP) ----------------------------------------------------------
  config.orders.interfaceMap = CORRECT_ERP_MAP.map((r) => ({ ...r }));
  config.orders.validationChecks = { skuValid: true, uomIsCases: true, bomExists: true, uiRangeAssigned: true };
  config.orders.releaseRule = { mode: 'horizon', horizonOrders: 12 };
  config.orders.decisions = Object.fromEntries(ORDER_FEED.map((m) => {
    const poisoned = ['IDOC-9061', 'IDOC-9062', 'IDOC-9063'].includes(m.msgId);
    return [m.msgId, poisoned ? 'rejected' : 'accepted'];
  }));

  // --- APS integration --------------------------------------------------------
  config.apsIntegration.interfaceMap = CORRECT_APS_MAP.map((r) => ({ ...r }));
  config.apsIntegration.feasibilityChecks = {
    orderReleased: true, blendAvailable: true, siloRouting: true,
    changeoverRules: true, materialReadiness: true,
  };
  config.apsIntegration.changeoverModel = {
    sameBlendSameFormatMin: 20, blendChangeMin: 120, formatChangeMin: 180, potentCleanMin: 360,
  };
  config.apsIntegration.purgeEnforcement = { enabled: true };
  config.apsIntegration.releaseGate = { mode: 'blockOnError' };
  config.apsIntegration.actualsFeedback = {
    enabled: true,
    fields: ['actualStart', 'actualEnd', 'goodCases', 'adherenceFlag'],
    onDelayMin: 15,
  };

  // --- Shopfloor connectivity --------------------------------------------------
  const connectable = nodes.filter(
    (n) => n.type === 'machine' || (n.type === 'buffer' && n.props.machineClass === 'reservoir')
  );
  config.connectivity.connections = connectable.map((m) => ({
    id: `CONN-${m.code}`, machineId: m.id, kind: DEVICE_CATALOG[m.code]?.kind ?? 'opcua',
    endpoint: DEVICE_CATALOG[m.code]?.endpoint ?? '', enabled: true,
  }));
  for (const code of ['CR3', 'CR5']) {
    const m = machine(code);
    if (m) config.connectivity.connections.push({ id: `CONN-SER-${code}`, machineId: m.id, kind: 'camera', endpoint: `SER-${code}`, enabled: true });
  }

  // Every dictionary signal mapped to its CORRECT node (unitScale 1 choices).
  const preferredNode = (code, signal) => {
    const cat = DEVICE_CATALOG[code];
    if (!cat) return null;
    return cat.nodes.find((n) => n.signal === signal && n.unitScale === 1)
      ?? cat.nodes.find((n) => n.signal === signal) ?? null;
  };
  config.connectivity.tagMap = [];
  for (const m of connectable) {
    const dict = SIGNAL_DICTIONARY[m.props.machineClass] ?? [];
    for (const req of dict) {
      const node = preferredNode(m.code, req.signal);
      if (!node) continue;
      config.connectivity.tagMap.push({
        id: `TAG-${m.code}-${req.signal}`, machineId: m.id, signal: req.signal,
        nodeId: node.nodeId, scale: node.unitScale === 1 ? 1 : node.unitScale, uom: req.uom,
        pollMs: 1000,
      });
    }
  }
  config.connectivity.signalRules = { staleTimeoutSec: 15, flatline: { enabled: true, windowMin: 15 } };

  // --- Track & trace -------------------------------------------------------------
  // Track points: batch opened at the press (IBC docked), coated batch opened at
  // the coater (suspension lot), blister lot opened (film + foil lots), batch
  // complete at the cartoner (carton UI level — the only UI-level event).
  config.traceability.trackPoints = [
    { id: 'TP-PR3-S', machineId: machineId('PR3'), event: 'runStart', idLevel: 'run' },
    { id: 'TP-CO1-S', machineId: machineId('CO1'), event: 'runStart', idLevel: 'run' },
    { id: 'TP-BL3-S', machineId: machineId('BL3'), event: 'runStart', idLevel: 'run' },
    { id: 'TP-CR3-C', machineId: machineId('CR3'), event: 'runComplete', idLevel: 'ui' },
    { id: 'TP-PR5-S', machineId: machineId('PR5'), event: 'runStart', idLevel: 'run' },
    { id: 'TP-CO5-S', machineId: machineId('CO5'), event: 'runStart', idLevel: 'run' },
    { id: 'TP-BL5-S', machineId: machineId('BL5'), event: 'runStart', idLevel: 'run' },
    { id: 'TP-CR5-C', machineId: machineId('CR5'), event: 'runComplete', idLevel: 'ui' },
  ];
  config.traceability.serialization = { uiPrintMachineClass: 'cartoner', cameraVerify: true, voidOnFail: true };
  config.traceability.aggregation = {
    levels: [
      { level: 'carton', scanMachineClass: 'cartoner', childCount: 10 },
      { level: 'case', scanMachineClass: 'casePacker', childCount: 20 },
      { level: 'pallet', scanMachineClass: 'palletizer', childCount: 48 },
    ],
  };
  config.traceability.genealogy = {
    blendLotCapture: true,
    materialLotCapture: MATERIAL_CATALOG.filter((i) => i.lotTracked).map((i) => i.id),
  };
  config.traceability.repository = { enabled: true, partnerId: 'EU-HUB', bufferAndRetry: true };

  // --- OEE ---------------------------------------------------------------------
  config.oee.stateModel = [
    { id: 'ST-RUN', name: 'Running', category: 'production' },
    { id: 'ST-STARVED', name: 'Starved', category: 'unplannedStop' },
    { id: 'ST-BLOCKED', name: 'Blocked', category: 'unplannedStop' },
    { id: 'ST-FAULT', name: 'Breakdown', category: 'unplannedStop' },
    { id: 'ST-CO', name: 'Changeover / line clearance', category: 'plannedStop' },
    { id: 'ST-IDLE', name: 'Idle / no order', category: 'notScheduled' },
  ];
  const fullWordMap = { 1: 'ST-RUN', 2: 'ST-STARVED', 3: 'ST-BLOCKED', 4: 'ST-FAULT', 5: 'ST-CO', 6: 'ST-IDLE' };
  config.oee.stateWordMap = {
    maker: { ...fullWordMap }, packer: { ...fullWordMap }, cartoner: { ...fullWordMap },
    casePacker: { ...fullWordMap }, palletizer: { ...fullWordMap }, reservoir: { ...fullWordMap },
    dispensary: { ...fullWordMap }, granulator: { ...fullWordMap }, dryer: { ...fullWordMap },
    mill: { ...fullWordMap }, blender: { ...fullWordMap }, kitchen: { ...fullWordMap },
  };
  config.oee.reasonTree = [
    { id: 'RC-EQ', label: 'Equipment', category: 'equipment', children: [
      { id: 'RC-EQ-PUNCH', label: 'Press punch / tooling' },
      { id: 'RC-EQ-SPLICE', label: 'Blister foil splice / sealing' },
      { id: 'RC-EQ-PRINT', label: 'Serialization printhead / camera' },
    ] },
    { id: 'RC-MAT', label: 'Material', category: 'material', children: [
      { id: 'RC-MAT-VIG', label: 'Vignette / fiscal material' },
      { id: 'RC-MAT-PACK', label: 'Cartons / leaflets / film / foil' },
      { id: 'RC-MAT-BLEND', label: 'Blend supply / IBC not docked' },
    ] },
    { id: 'RC-MIN', label: 'Minor stops', category: 'minor', children: [
      { id: 'RC-MIN-JAM', label: 'Jam / misfeed' },
    ] },
    { id: 'RC-ORG', label: 'Organizational', category: 'organizational', children: [
      { id: 'RC-ORG-CREW', label: 'No operator / line clearance sign-off wait' },
    ] },
  ];
  config.oee.shortStopThresholdMin = 3;
  config.oee.calendar = {
    shiftStart: '06:00', shiftEnd: '14:00',
    breaks: [
      { id: 'BRK-1', start: '08:30', minutes: 15, classifiedAs: 'plannedStop' },
      { id: 'BRK-2', start: '11:00', minutes: 30, classifiedAs: 'plannedStop' },
    ],
    plannedMaint: [],
  };

  // --- Quality -------------------------------------------------------------------
  config.quality.inspectionPlans = [
    { id: 'IP-PR3-SPC', machineId: machineId('PR3'), source: 'inlineGauge', n: 1, checks: [
      { characteristic: 'tabletWeight', spec: '250 mg ± 5 %', reaction: 'andon' },
      { characteristic: 'hardness', spec: '80–140 N', reaction: 'hold' },
    ] },
    { id: 'IP-PR5-SPC', machineId: machineId('PR5'), source: 'inlineGauge', n: 1, checks: [
      { characteristic: 'tabletWeight', spec: 'SKU target ± 5 %', reaction: 'andon' },
      { characteristic: 'hardness', spec: '80–140 N', reaction: 'hold' },
    ] },
    { id: 'IP-PR3-FO', machineId: machineId('PR3'), source: 'firstOff', n: 1, checks: [
      { characteristic: 'line clearance + first-off (identity, appearance, residue swab)', spec: 'no residue, correct blend lot, eBR opened', reaction: 'hold' },
    ] },
    { id: 'IP-PR5-FO', machineId: machineId('PR5'), source: 'firstOff', n: 1, checks: [
      { characteristic: 'line clearance + first-off (identity, appearance, residue swab)', spec: 'no residue, correct blend lot, eBR opened', reaction: 'hold' },
    ] },
    { id: 'IP-CP1-CW', machineId: machineId('CP1'), source: 'checkweigher', n: 1, checks: [
      { characteristic: 'caseWeight', spec: '20 bundles (200 cartons) — 5.4 kg ± 2 %', reaction: 'hold' },
    ] },
  ];
  config.quality.containment = [
    { id: 'CT-SEV3-HOLD', minSeverity: 3, action: 'holdCases' },
    { id: 'CT-SEV3-UI', minSeverity: 3, action: 'blockUiRange' },
    { id: 'CT-SEV2-HOLD', minSeverity: 2, action: 'holdCases' },
  ];

  return config;
}
