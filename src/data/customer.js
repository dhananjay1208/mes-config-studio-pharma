// The Helvion Pharma engagement — the customer's URS-style brief. This is
// REFERENCE data (what the customer wants); the trainee's plantConfig is what
// they actually configure. Validation and guided acceptance compare the two.
//
// Every code, id, endpoint, state word and fault code here is canon —
// see ..\..\..\PHARMA-MES-CONTEXT.md (Plant 2 Lakeworth). The PLC workshop
// (mes-plc-pharma) locks its L2 landscape against THIS file.
//
// Scheduling reality at this customer: production runs are sequenced in an
// EXTERNAL APS ("Cadence APS" by Northline Planning Systems). The MES receives
// the schedule, validates feasibility, and feeds actuals back. It never
// re-sequences.

export const CUSTOMER = {
  name: 'Helvion Pharma',
  plant: 'Plant 2 Lakeworth',
  plantCode: '2000',
  consultantOrg: 'Helvion Digital Consulting',
  currency: '€',
};

// ---------------------------------------------------------------------------
// Product specification (the SKU portfolio the MES must handle)
//   family    = the API / product family. A change WITHIN a family (strength,
//               market/artwork, a new batch of the same SKU) is the cheap
//               20-minute line clearance; a change ACROSS families is a product
//               change with a minor clean.
//   blendCode = the final-blend lot family an IBC must hold to feed the run.
//   format    = tooling set (T11 = 11 mm round · T4 = 4 mm mini-tablet multi-tip).
//   potent    = intensely coloured, potent API — segregated Line 5 only, and a
//               validated clean (swab + QA release) before anything follows.
// ---------------------------------------------------------------------------
export const PRODUCT_SPEC = {
  blends: [
    { code: 'BLND-CDX10', name: 'Cardexil 10 mg final blend', family: 'CDX', potent: false },
    { code: 'BLND-CDX20', name: 'Cardexil 20 mg final blend', family: 'CDX', potent: false },
    { code: 'BLND-ZTX50', name: 'Zentrix 50 mg final blend (potent, coloured)', family: 'ZTX', potent: true },
    { code: 'BLND-FEM25', name: 'Femodyl 2.5 mg mini-tablet blend', family: 'FEM', potent: false },
  ],
  skus: [
    { code: 'CDX-10', name: 'Cardexil 10 mg film-coated tablets', family: 'CDX', format: 'T11', blendCode: 'BLND-CDX10', potent: false, market: 'DOM', gtin: '00359123000108', tabletsPerCarton: 20, cartonsPerCase: 200, targetTabletWeightMg: 250, targetHardnessN: 110 },
    { code: 'CDX-20', name: 'Cardexil 20 mg film-coated tablets', family: 'CDX', format: 'T11', blendCode: 'BLND-CDX20', potent: false, market: 'DOM', gtin: '00359123000207', tabletsPerCarton: 20, cartonsPerCase: 200, targetTabletWeightMg: 250, targetHardnessN: 110 },
    { code: 'CDX-10-EXP', name: 'Cardexil 10 mg EXPORT (Italy — vignette)', family: 'CDX', format: 'T11', blendCode: 'BLND-CDX10', potent: false, market: 'EXP', gtin: '00359123000306', tabletsPerCarton: 20, cartonsPerCase: 200, targetTabletWeightMg: 250, targetHardnessN: 110 },
    { code: 'ZTX-50', name: 'Zentrix 50 mg film-coated tablets (potent)', family: 'ZTX', format: 'T11', blendCode: 'BLND-ZTX50', potent: true, market: 'DOM', gtin: '00359123000405', tabletsPerCarton: 20, cartonsPerCase: 200, targetTabletWeightMg: 250, targetHardnessN: 90 },
    { code: 'FEM-2.5', name: 'Femodyl 2.5 mg mini-tablets', family: 'FEM', format: 'T4', blendCode: 'BLND-FEM25', potent: false, market: 'DOM', gtin: '00359123000504', tabletsPerCarton: 20, cartonsPerCase: 200, targetTabletWeightMg: 80, targetHardnessN: 45 },
  ],
};

// ---------------------------------------------------------------------------
// Plant specification (the customer's layout requirement — URS excerpt).
// Unit hierarchy (legible on purpose): 10 tablets/blister · 2 blisters/carton
// (20 tablets) · 10 cartons/bundle · 20 bundles/case = 200 cartons = 4,000
// tablets per case. Press 4,000 tab/min and blister 400/min ⇒ exactly
// 1 case/min at the cartoner. Batch 400 kg ≈ 1.6 M tablets = 400 cases.
// ---------------------------------------------------------------------------
export const PLANT_SPEC = {
  flow: [
    { kind: 'area', areaClass: 'upstream', name: 'Granulation Suite (batch)', minMachines: 6 },
    { kind: 'area', areaClass: 'primaryFeed', name: 'Blend Supply (IBC fleet)', minSilos: 4 },
    { kind: 'area', areaClass: 'secondary', name: 'Compression, Coating & Packaging Lines', minLines: 2 },
    { kind: 'area', areaClass: 'finishing', name: 'Case Packing & Palletizing', minMachines: 2 },
  ],
  lineRequirement: 'Each line: press → coater + coated-bulk hold (≥ 60 min of decoupling) → blister → cartoner/serialization. Line 5 is potent-segregated with its own coater.',
};

// Insert-template definitions used by the Plant Modeler "standard line" buttons.
// Machine props carry the rated speeds the engine and validators read.
export const LINE_TEMPLATES = {
  line3: {
    area: { name: 'Compression, Coating & Packaging Lines', code: 'SEC', areaClass: 'secondary' },
    line: { name: 'Line 3', code: 'L3', potentCapable: false },
    machines: [
      { name: 'Rotary tablet press 3', code: 'PR3', machineClass: 'maker', ratedTabletsMin: 4000 },
      { name: 'Pan coater 1 + coated-bulk hold', code: 'CO1', machineClass: 'reservoir', kind: 'buffer', bufferMin: 120 },
      { name: 'Blister machine 3', code: 'BL3', machineClass: 'packer', ratedBlistersMin: 400 },
      { name: 'Cartoner + serialization station 3', code: 'CR3', machineClass: 'cartoner', ratedCartonsMin: 200 },
    ],
  },
  line5: {
    area: { name: 'Compression, Coating & Packaging Lines', code: 'SEC', areaClass: 'secondary' },
    line: { name: 'Line 5 (potent, segregated)', code: 'L5', potentCapable: true },
    machines: [
      { name: 'Rotary tablet press 5', code: 'PR5', machineClass: 'maker', ratedTabletsMin: 4000 },
      { name: 'Pan coater 5 + coated-bulk hold (potent)', code: 'CO5', machineClass: 'reservoir', kind: 'buffer', bufferMin: 120 },
      { name: 'Blister machine 5', code: 'BL5', machineClass: 'packer', ratedBlistersMin: 400 },
      { name: 'Cartoner + serialization station 5', code: 'CR5', machineClass: 'cartoner', ratedCartonsMin: 200 },
    ],
  },
  upstream: {
    area: { name: 'Granulation Suite (batch)', code: 'UPS', areaClass: 'upstream' },
    line: { name: 'Granulation Suite 1', code: 'GS1', potentCapable: false },
    machines: [
      { name: 'Dispensary (weigh & dispense booth)', code: 'DSP1', machineClass: 'dispensary' },
      { name: 'High-shear granulator 1', code: 'GRN1', machineClass: 'granulator' },
      { name: 'Fluid-bed dryer 2', code: 'FBD2', machineClass: 'dryer' },
      { name: 'Mill / sizer 1', code: 'SIZ1', machineClass: 'mill' },
      { name: 'Final blender 1', code: 'BLD1', machineClass: 'blender' },
      { name: 'Coating kitchen 1', code: 'CK1', machineClass: 'kitchen' },
    ],
  },
  finishing: {
    area: { name: 'Case Packing & Palletizing', code: 'FIN', areaClass: 'finishing' },
    line: { name: 'Finishing Line', code: 'FIN1', potentCapable: false },
    machines: [
      { name: 'Case packer 1', code: 'CP1', machineClass: 'casePacker', ratedCasesMin: 2 },
      { name: 'Palletizer 1', code: 'PZ1', machineClass: 'palletizer', ratedCasesMin: 3 },
    ],
  },
};

// The IBC fleet — the blend supply represented as a constraint feed. Each IBC
// holds one final-blend lot; feedsLineCodes says which press it may dock on
// (potent blend docks on PR5 only). Levels are kg; a 250 mg tablet makes
// 1 kg of blend exactly one case (4,000 tablets), so kg read like cases.
export const SILO_TEMPLATES = [
  { code: 'IBC-0012', name: 'IBC-0012 — BLND-1834 Cardexil 10 mg', blendCode: 'BLND-CDX10', capacityKg: 400, startLevelKg: 380, feedsLineCodes: ['L3'] },
  { code: 'IBC-0032', name: 'IBC-0032 — BLND-1841 Femodyl 2.5 mg', blendCode: 'BLND-FEM25', capacityKg: 400, startLevelKg: 60, feedsLineCodes: ['L3'] },
  { code: 'IBC-0033', name: 'IBC-0033 — BLND-1838 Cardexil 20 mg', blendCode: 'BLND-CDX20', capacityKg: 400, startLevelKg: 200, feedsLineCodes: ['L3', 'L5'] },
  { code: 'IBC-0034', name: 'IBC-0034 — BLND-1839 Zentrix 50 mg (potent, dedicated)', blendCode: 'BLND-ZTX50', capacityKg: 400, startLevelKg: 200, feedsLineCodes: ['L5'] },
];

// ---------------------------------------------------------------------------
// Shopfloor connectivity — the machine-side truth.
//
// SIGNAL_DICTIONARY: the canonical signal set the MES NEEDS per machine class.
// The Connectivity module renders this as the mapping worksheet; validators
// flag anything unmapped; the run only records what is mapped.
// ---------------------------------------------------------------------------
export const SIGNAL_DICTIONARY = {
  maker: [
    { signal: 'prodCount', label: 'Tablet counter', uom: 'tablets', kind: 'counter', critical: true },
    { signal: 'rejForce', label: 'Rejects — compression force (auto-reject)', uom: 'tablets', kind: 'counter', critical: true },
    { signal: 'rejMetal', label: 'Rejects — metal detector', uom: 'tablets', kind: 'counter', critical: true },
    { signal: 'rejCapping', label: 'Rejects — capping / visual', uom: 'tablets', kind: 'counter', critical: false },
    { signal: 'stateWord', label: 'Machine state word', uom: 'enum', kind: 'state', critical: true },
    { signal: 'faultCode', label: 'Active fault code', uom: 'code', kind: 'state', critical: false },
    { signal: 'speed', label: 'Speed', uom: 'tab/min', kind: 'analog', critical: false },
    { signal: 'tabletWeightMg', label: 'Tablet weight (IPC auto-tester)', uom: 'mg', kind: 'analog', critical: true },
    { signal: 'hardnessN', label: 'Hardness (IPC auto-tester)', uom: 'N', kind: 'analog', critical: true },
  ],
  reservoir: [
    { signal: 'bufferLevel', label: 'Coated bulk staged for packaging', uom: '%', kind: 'analog', critical: true },
  ],
  packer: [
    { signal: 'prodCount', label: 'Blister counter', uom: 'blisters', kind: 'counter', critical: true },
    { signal: 'rejFill', label: 'Rejects — fill / empty-pocket camera', uom: 'blisters', kind: 'counter', critical: true },
    { signal: 'rejSeal', label: 'Rejects — seal / foil splice', uom: 'blisters', kind: 'counter', critical: true },
    { signal: 'stateWord', label: 'Machine state word', uom: 'enum', kind: 'state', critical: true },
    { signal: 'faultCode', label: 'Active fault code', uom: 'code', kind: 'state', critical: false },
    { signal: 'speed', label: 'Speed', uom: 'blisters/min', kind: 'analog', critical: false },
  ],
  cartoner: [
    { signal: 'prodCount', label: 'Carton counter', uom: 'cartons', kind: 'counter', critical: true },
    { signal: 'rejUiVerify', label: 'Rejects — UI verify fail (serialization camera)', uom: 'cartons', kind: 'counter', critical: true },
    { signal: 'rejLeaflet', label: 'Rejects — leaflet missing', uom: 'cartons', kind: 'counter', critical: false },
    { signal: 'stateWord', label: 'Machine state word', uom: 'enum', kind: 'state', critical: true },
    { signal: 'faultCode', label: 'Active fault code', uom: 'code', kind: 'state', critical: false },
  ],
  casePacker: [
    { signal: 'prodCount', label: 'Case counter', uom: 'cases', kind: 'counter', critical: true },
    { signal: 'stateWord', label: 'Machine state word', uom: 'enum', kind: 'state', critical: true },
    { signal: 'caseWeightKg', label: 'Case checkweigher', uom: 'kg', kind: 'analog', critical: true },
  ],
  palletizer: [
    { signal: 'prodCount', label: 'Cases palletized', uom: 'cases', kind: 'counter', critical: true },
    { signal: 'stateWord', label: 'Machine state word', uom: 'enum', kind: 'state', critical: true },
  ],
  dispensary: [
    { signal: 'dispWeightKg', label: 'Dispensing balance — net weight', uom: 'kg', kind: 'analog', critical: true },
    { signal: 'stateWord', label: 'Booth state word', uom: 'enum', kind: 'state', critical: false },
  ],
  granulator: [
    { signal: 'impellerKw', label: 'Impeller power draw (endpoint)', uom: 'kW', kind: 'analog', critical: true },
    { signal: 'stateWord', label: 'Machine state word', uom: 'enum', kind: 'state', critical: true },
  ],
  dryer: [
    { signal: 'lodPct', label: 'Inline NIR moisture (LOD)', uom: '%', kind: 'analog', critical: true },
    { signal: 'inletTempC', label: 'Inlet air temperature', uom: '°C', kind: 'analog', critical: false },
    { signal: 'stateWord', label: 'Machine state word', uom: 'enum', kind: 'state', critical: true },
  ],
  mill: [
    { signal: 'millRpm', label: 'Mill speed', uom: 'rpm', kind: 'analog', critical: false },
    { signal: 'stateWord', label: 'Machine state word', uom: 'enum', kind: 'state', critical: true },
  ],
  blender: [
    { signal: 'revCount', label: 'Blender revolutions', uom: 'rev', kind: 'counter', critical: true },
    { signal: 'stateWord', label: 'Machine state word', uom: 'enum', kind: 'state', critical: true },
  ],
  kitchen: [
    { signal: 'potLifeMin', label: 'Suspension pot-life clock', uom: 'min', kind: 'analog', critical: true },
    { signal: 'stateWord', label: 'Vessel state word', uom: 'enum', kind: 'state', critical: false },
  ],
};

// Ground-truth semantics of every machine's state word (used by the reality
// tape and by the OEE module's State-Word Mapping tab as the raw value list).
// FROZEN across packs: 1=Running · 2=Starved · 3=Blocked · 4=Fault ·
// 5=Changeover · 6=Idle.
export const STATE_WORD_VALUES = [
  { word: 1, meaning: 'running' },
  { word: 2, meaning: 'starved' },
  { word: 3, meaning: 'blocked' },
  { word: 4, meaning: 'fault' },
  { word: 5, meaning: 'changeover' },
  { word: 6, meaning: 'idle' },
];

// Canon fault codes (surface in the Fault.Code registers and the reality tape).
export const FAULT_CODES = [
  { code: 3104, machine: 'PR3/PR5', desc: 'Punch overload' },
  { code: 5203, machine: 'BL3/BL5', desc: 'Foil splice fault' },
  { code: 2205, machine: 'CR3/CR5', desc: 'UI printhead fault' },
  { code: 4408, machine: 'CR3/CR5', desc: 'Leaflet missing' },
];

// DEVICE_CATALOG: what each machine's controller ACTUALLY offers — the OPC UA
// address space (plus Modbus/camera/scanner devices). Keyed by machine CODE
// (template codes; a machine with no catalog entry cannot be connected).
//
// unitScale = factor that converts the RAW node value into the canonical
// engineering unit of its signal. The trainee's tagMap.scale must equal
// unitScale for correct recording: recorded = truth × (scale / unitScale).
// Deliberate traps (canon): TabCountK — the press's legacy counter counts
// KILO-tablets (1 raw = 1,000 tablets; a 16-bit register would roll over at
// 65,535) — and WeightTmg — tablet weight in TENTHS of a milligram (2,500 =
// 250.0 mg; read as mg it is a ×10 error).
function pressNodes(code) {
  return [
    { nodeId: `ns=2;s=${code}.Prod.TabCount`, signal: 'prodCount', unitScale: 1, desc: 'Tablet counter (tablets)' },
    { nodeId: `ns=2;s=${code}.Prod.TabCountK`, signal: 'prodCount', unitScale: 1000, desc: 'Legacy counter — KILO-tablets (1 raw = 1,000 tablets; 16-bit)' },
    { nodeId: `ns=2;s=${code}.Rej.Force`, signal: 'rejForce', unitScale: 1, desc: 'Compression-force auto-reject counter' },
    { nodeId: `ns=2;s=${code}.Rej.Metal`, signal: 'rejMetal', unitScale: 1, desc: 'Metal-detector reject counter' },
    { nodeId: `ns=2;s=${code}.Rej.Capping`, signal: 'rejCapping', unitScale: 1, desc: 'Capping / visual reject counter' },
    { nodeId: `ns=2;s=${code}.State.Word`, signal: 'stateWord', unitScale: 1, desc: 'State word (1=run 2=starved 3=blocked 4=fault 5=CO 6=idle)' },
    { nodeId: `ns=2;s=${code}.Fault.Code`, signal: 'faultCode', unitScale: 1, desc: 'Active fault code (3104 = punch overload)' },
    { nodeId: `ns=2;s=${code}.Speed.Tpm`, signal: 'speed', unitScale: 1, desc: 'Speed, tablets/min' },
    { nodeId: `ns=2;s=${code}.Speed.TurretRpm`, signal: 'turretRpm', unitScale: 1, desc: 'Turret speed, rpm (50 stations × 80 rpm = 4,000 tab/min)' },
    { nodeId: `ns=2;s=${code}.Gauge.WeightMg`, signal: 'tabletWeightMg', unitScale: 1, desc: 'IPC auto-tester weight, milligrams' },
    { nodeId: `ns=2;s=${code}.Gauge.WeightTmg`, signal: 'tabletWeightMg', unitScale: 0.1, desc: 'Weight register in TENTHS of a milligram (2,500 = 250.0 mg)' },
    { nodeId: `ns=2;s=${code}.Gauge.HardnessN`, signal: 'hardnessN', unitScale: 1, desc: 'IPC auto-tester hardness, newtons' },
    { nodeId: `ns=2;s=${code}.Gauge.ForceKn`, signal: 'forceKn', unitScale: 1, desc: 'Main compression force, kN (per-tablet force monitoring)' },
    { nodeId: `ns=2;s=${code}.Gauge.FillDepthMm`, signal: 'fillDepthMm', unitScale: 1, desc: 'Fill depth, mm' },
  ];
}
function blisterNodes(code) {
  return [
    { nodeId: `ns=2;s=${code}.Prod.BlisterCount`, signal: 'prodCount', unitScale: 1, desc: 'Blister counter (blisters)' },
    { nodeId: `ns=2;s=${code}.Rej.Fill`, signal: 'rejFill', unitScale: 1, desc: 'Fill / empty-pocket camera reject counter' },
    { nodeId: `ns=2;s=${code}.Rej.Seal`, signal: 'rejSeal', unitScale: 1, desc: 'Seal / foil-splice reject counter' },
    { nodeId: `ns=2;s=${code}.State.Word`, signal: 'stateWord', unitScale: 1, desc: 'State word' },
    { nodeId: `ns=2;s=${code}.Fault.Code`, signal: 'faultCode', unitScale: 1, desc: 'Active fault code (5203 = foil splice)' },
    { nodeId: `ns=2;s=${code}.Speed.Bpm`, signal: 'speed', unitScale: 1, desc: 'Speed, blisters/min' },
    { nodeId: `ns=2;s=${code}.Acc.LevelPct`, signal: 'accLevelPct', unitScale: 1, desc: 'Outfeed accumulator to the cartoner, % (600 blisters ≈ 90 s)' },
  ];
}
function cartonerNodes(code) {
  return [
    { nodeId: `ns=2;s=${code}.Prod.CartonCount`, signal: 'prodCount', unitScale: 1, desc: 'Carton counter' },
    { nodeId: `ns=2;s=${code}.Rej.UiVerify`, signal: 'rejUiVerify', unitScale: 1, desc: 'UI verify-fail reject counter (serialization camera)' },
    { nodeId: `ns=2;s=${code}.Rej.Leaflet`, signal: 'rejLeaflet', unitScale: 1, desc: 'Leaflet-missing reject counter' },
    { nodeId: `ns=2;s=${code}.State.Word`, signal: 'stateWord', unitScale: 1, desc: 'State word' },
    { nodeId: `ns=2;s=${code}.Fault.Code`, signal: 'faultCode', unitScale: 1, desc: 'Active fault code (2205 = UI printhead · 4408 = leaflet missing)' },
  ];
}
const ep = (code) => `opc.tcp://${code.toLowerCase()}-plc.hp2.local:4840`;

export const DEVICE_CATALOG = {
  // --- Line 3 ---------------------------------------------------------------
  'PR3': { kind: 'opcua', endpoint: ep('PR3'), nodes: pressNodes('PR3'),
    devices: [{ id: 'CW-PR3', kind: 'scanner', desc: 'At-line tablet checkweigher / IPC tester, modbus.tcp://cw-pr3.hp2.local:502 via EG-UPS-01 — see the PLC workshop' }] },
  'CO1': { kind: 'opcua', endpoint: ep('CO1'), nodes: [
    { nodeId: 'ns=2;s=CO1.Hold.Pct', signal: 'bufferLevel', unitScale: 1, desc: 'Coated bulk staged for BL3, % of hold' },
  ] },
  'BL3': { kind: 'opcua', endpoint: ep('BL3'), nodes: blisterNodes('BL3') },
  'CR3': { kind: 'opcua', endpoint: ep('CR3'), nodes: cartonerNodes('CR3'),
    devices: [
      { id: 'SER-CR3', kind: 'camera', desc: 'Serialization station — UI print & verify camera (DataMatrix), vendor API via EG-PKG-01' },
      { id: 'SCAN-BN3', kind: 'scanner', desc: 'Bundle aggregation scanner (BN3 bundler at the cartoner outfeed)' },
    ] },
  // --- Line 5 (potent, segregated) --------------------------------------------
  'PR5': { kind: 'opcua', endpoint: ep('PR5'), nodes: pressNodes('PR5'),
    devices: [{ id: 'CW-PR5', kind: 'scanner', desc: 'At-line tablet checkweigher / IPC tester, modbus.tcp://cw-pr5.hp2.local:502 via EG-UPS-01' }] },
  'CO5': { kind: 'opcua', endpoint: ep('CO5'), nodes: [
    { nodeId: 'ns=2;s=CO5.Hold.Pct', signal: 'bufferLevel', unitScale: 1, desc: 'Coated bulk staged for BL5, % of hold' },
  ] },
  'BL5': { kind: 'opcua', endpoint: ep('BL5'), nodes: blisterNodes('BL5') },
  'CR5': { kind: 'opcua', endpoint: ep('CR5'), nodes: cartonerNodes('CR5'),
    devices: [
      { id: 'SER-CR5', kind: 'camera', desc: 'Serialization station — UI print & verify camera (DataMatrix), vendor API via EG-PKG-01' },
      { id: 'SCAN-BN5', kind: 'scanner', desc: 'Bundle aggregation scanner (BN5 bundler at the cartoner outfeed)' },
    ] },
  // --- Shared finishing (downstream of sealed cartons only) --------------------
  'CP1': { kind: 'opcua', endpoint: ep('CP1'), nodes: [
    { nodeId: 'ns=2;s=CP1.Prod.CaseCount', signal: 'prodCount', unitScale: 1, desc: 'Case counter' },
    { nodeId: 'ns=2;s=CP1.State.Word', signal: 'stateWord', unitScale: 1, desc: 'State word' },
    { nodeId: 'modbus.tcp://cw-cp1.hp2.local:502/40001', signal: 'caseWeightKg', unitScale: 1, desc: 'Case checkweigher CW-CP1 (Modbus TCP, holding register 40001, kg)' },
  ], devices: [
    { id: 'SCAN-CP1', kind: 'scanner', desc: 'Case aggregation scanner' },
    { id: 'PRN-CP1', kind: 'printer', desc: 'Case label print-&-apply (tcp://prn-cp1.hp2.local:9100) — see the labeling workshop' },
  ] },
  'PZ1': { kind: 'opcua', endpoint: ep('PZ1'), nodes: [
    { nodeId: 'ns=2;s=PZ1.Prod.CaseInCount', signal: 'prodCount', unitScale: 1, desc: 'Cases-palletized counter' },
    { nodeId: 'ns=2;s=PZ1.State.Word', signal: 'stateWord', unitScale: 1, desc: 'State word' },
  ], devices: [
    { id: 'SCAN-PZ1', kind: 'scanner', desc: 'Pallet SSCC scanner' },
    { id: 'PRN-PZ1', kind: 'printer', desc: 'Pallet SSCC label printer (Zebra ZT411)' },
  ] },
  // --- Granulation suite (batch, upstream) --------------------------------------
  'DSP1': { kind: 'opcua', endpoint: ep('DSP1'), nodes: [
    { nodeId: 'ns=2;s=DSP1.Scale.NetKg', signal: 'dispWeightKg', unitScale: 1, desc: 'Dispensing balance net weight, kg (every print = an eBR entry)' },
    { nodeId: 'ns=2;s=DSP1.State.Word', signal: 'stateWord', unitScale: 1, desc: 'Booth state word' },
  ] },
  'GRN1': { kind: 'opcua', endpoint: ep('GRN1'), nodes: [
    { nodeId: 'ns=2;s=GRN1.Impeller.Kw', signal: 'impellerKw', unitScale: 1, desc: 'Impeller power draw, kW (granulation endpoint)' },
    { nodeId: 'ns=2;s=GRN1.State.Word', signal: 'stateWord', unitScale: 1, desc: 'State word' },
  ] },
  'FBD2': { kind: 'opcua', endpoint: ep('FBD2'), nodes: [
    { nodeId: 'ns=2;s=FBD2.NIR.LodPct', signal: 'lodPct', unitScale: 1, desc: 'Inline NIR moisture (LOD), % — controls the dryer endpoint' },
    { nodeId: 'ns=2;s=FBD2.Air.InletTempC', signal: 'inletTempC', unitScale: 1, desc: 'Inlet air temperature, °C' },
    { nodeId: 'ns=2;s=FBD2.State.Word', signal: 'stateWord', unitScale: 1, desc: 'State word' },
  ] },
  'SIZ1': { kind: 'opcua', endpoint: ep('SIZ1'), nodes: [
    { nodeId: 'ns=2;s=SIZ1.Mill.Rpm', signal: 'millRpm', unitScale: 1, desc: 'Mill speed, rpm' },
    { nodeId: 'ns=2;s=SIZ1.State.Word', signal: 'stateWord', unitScale: 1, desc: 'State word' },
  ] },
  'BLD1': { kind: 'opcua', endpoint: ep('BLD1'), nodes: [
    { nodeId: 'ns=2;s=BLD1.Rev.Count', signal: 'revCount', unitScale: 1, desc: 'Blender revolution counter' },
    { nodeId: 'ns=2;s=BLD1.State.Word', signal: 'stateWord', unitScale: 1, desc: 'State word' },
  ] },
  'CK1': { kind: 'opcua', endpoint: ep('CK1'), nodes: [
    { nodeId: 'ns=2;s=CK1.PotLife.Min', signal: 'potLifeMin', unitScale: 1, desc: 'Coating-suspension pot-life clock, min (24 h limit)' },
    { nodeId: 'ns=2;s=CK1.State.Word', signal: 'stateWord', unitScale: 1, desc: 'Vessel state word' },
  ] },
};

// Infrastructure named in the canon (informational; surfaces in guide text).
export const INFRASTRUCTURE = {
  edgeGateway: 'EG-PKG-01',          // packaging edge gateway (serialization cameras, vendor API)
  edgeUpstream: 'EG-UPS-01',         // bulk-manufacturing edge gateway (GRN1/FBD2/BLD1 + checkweighers)
  historian: 'HP2-HIST',
  serializationManager: 'HP2-SER',
  l4SerializationGateway: 'L4-SER-GW',
  labelMiddleware: 'http://labelsvc.hp2.local:8080',
};

// ---------------------------------------------------------------------------
// External partners / systems
// ---------------------------------------------------------------------------
export const PARTNERS = [
  { id: 'ERP-SAP', name: 'Corporate ERP (SAP S/4HANA)', type: 'erp', commodity: 'Process orders (weekly)' },
  { id: 'APS-CADENCE', name: 'Cadence APS — Northline Planning Systems', type: 'aps', commodity: 'Finite schedule (sequenced runs per line)' },
  { id: 'EU-HUB', name: 'EU Hub (EMVO) via the L4 EPCIS gateway', type: 'repository', commodity: 'FMD serial upload (EU 2016/161) + EPCIS aggregation events' },
  { id: 'SER-L4', name: 'L4 serialization provider (HP2-SER ↔ L4-SER-GW)', type: 'issuer', commodity: 'Randomised serial-number pools (≤ 20 alnum)' },
];

// ---------------------------------------------------------------------------
// Customer material catalog (the part list the trainee pulls from).
// Only line-consumed materials are here: API and excipients are consumed in
// the granulation suite and enter the record through dispensing, not the BOM.
// ---------------------------------------------------------------------------
export const MATERIAL_CATALOG = [
  { id: 'BLND-CDX10', code: 'BLND-CDX10', desc: 'Final blend — Cardexil 10 mg (IBC)', type: 'blend', uom: 'KG', lotTracked: true, market: null },
  { id: 'BLND-CDX20', code: 'BLND-CDX20', desc: 'Final blend — Cardexil 20 mg (IBC)', type: 'blend', uom: 'KG', lotTracked: true, market: null },
  { id: 'BLND-ZTX50', code: 'BLND-ZTX50', desc: 'Final blend — Zentrix 50 mg (potent, dedicated IBC)', type: 'blend', uom: 'KG', lotTracked: true, market: null },
  { id: 'BLND-FEM25', code: 'BLND-FEM25', desc: 'Final blend — Femodyl 2.5 mg mini-tablet', type: 'blend', uom: 'KG', lotTracked: true, market: null },
  { id: 'CS-CDX', code: 'CS-CDX', desc: 'Coating suspension — Cardexil white (pot life 24 h)', type: 'coatingSusp', uom: 'KG', lotTracked: true, market: null },
  { id: 'CS-ZTX', code: 'CS-ZTX', desc: 'Coating suspension — Zentrix coloured (pot life 24 h)', type: 'coatingSusp', uom: 'KG', lotTracked: true, market: null },
  { id: 'FILM-PVDC', code: 'FILM-PVDC', desc: 'Blister forming film, PVC/PVDC', type: 'film', uom: 'EA', lotTracked: true, market: null },
  { id: 'FOIL-AL', code: 'FOIL-AL', desc: 'Lidding foil, aluminium (push-through)', type: 'foil', uom: 'EA', lotTracked: true, market: null },
  { id: 'CTN-CDX10-DOM', code: 'CTN-CDX10-DOM', desc: 'Carton blank — Cardexil 10 mg domestic', type: 'carton', uom: 'EA', lotTracked: true, market: 'DOM' },
  { id: 'CTN-CDX10-EXP', code: 'CTN-CDX10-EXP', desc: 'Carton blank — Cardexil 10 mg EXPORT (Italian artwork, AIC field)', type: 'carton', uom: 'EA', lotTracked: true, market: 'EXP' },
  { id: 'CTN-CDX20', code: 'CTN-CDX20', desc: 'Carton blank — Cardexil 20 mg', type: 'carton', uom: 'EA', lotTracked: true, market: 'DOM' },
  { id: 'CTN-ZTX50', code: 'CTN-ZTX50', desc: 'Carton blank — Zentrix 50 mg', type: 'carton', uom: 'EA', lotTracked: true, market: 'DOM' },
  { id: 'CTN-FEM25', code: 'CTN-FEM25', desc: 'Carton blank — Femodyl 2.5 mg', type: 'carton', uom: 'EA', lotTracked: true, market: 'DOM' },
  { id: 'LFT-CDX-DOM', code: 'LFT-CDX-DOM', desc: 'Patient leaflet — Cardexil, domestic', type: 'leaflet', uom: 'EA', lotTracked: true, market: 'DOM' },
  { id: 'LFT-CDX-EXP', code: 'LFT-CDX-EXP', desc: 'Patient leaflet — Cardexil, Italian', type: 'leaflet', uom: 'EA', lotTracked: true, market: 'EXP' },
  { id: 'LFT-ZTX', code: 'LFT-ZTX', desc: 'Patient leaflet — Zentrix', type: 'leaflet', uom: 'EA', lotTracked: true, market: 'DOM' },
  { id: 'LFT-FEM', code: 'LFT-FEM', desc: 'Patient leaflet — Femodyl', type: 'leaflet', uom: 'EA', lotTracked: true, market: 'DOM' },
  { id: 'ATD-SEAL', code: 'ATD-SEAL', desc: 'Anti-tamper seal label (FMD ATD)', type: 'tamper', uom: 'EA', lotTracked: true, market: null },
  { id: 'VIG-IT-CDX10', code: 'VIG-IT-CDX10', desc: 'Italian reimbursement vignette (bollino) — Cardexil 10 mg, lot-tracked, reconciled per shift', type: 'vignette', uom: 'EA', lotTracked: true, market: 'EXP' },
  { id: 'SHRINK-BN', code: 'SHRINK-BN', desc: 'Bundle shrink film', type: 'bundleFilm', uom: 'EA', lotTracked: true, market: null },
  { id: 'LBL-BUNDLE', code: 'LBL-BUNDLE', desc: 'Bundle label stock', type: 'label', uom: 'EA', lotTracked: true, market: null },
  { id: 'CASE-BLANK', code: 'CASE-BLANK', desc: 'Corrugated case blanks', type: 'caseBlank', uom: 'EA', lotTracked: true, market: null },
  { id: 'LBL-CASE', code: 'LBL-CASE', desc: 'Case label stock (GS1-128)', type: 'label', uom: 'EA', lotTracked: true, market: null },
  { id: 'LBL-PALLET', code: 'LBL-PALLET', desc: 'Pallet SSCC label stock', type: 'label', uom: 'EA', lotTracked: true, market: null },
];

// Serial-number pool suggestions shown in the Materials module (the trainee
// still has to request & assign them — the export trap). Under FMD the
// serials come ONLY from the L4 serialization provider's allocated pools
// (randomised, ≤ 20 alphanumeric); the MES never invents a serial.
export const UI_RANGE_SPEC = [
  { id: 'SNP-DOM-01', market: 'DOM', issuerId: 'SER-L4', rangeStart: '4T7K9DQ2CX000001', size: 500000 },
  { id: 'SNP-EXP-01', market: 'EXP', issuerId: 'SER-L4', rangeStart: '7HQ2ZM4KIT000001', size: 200000 },
];
