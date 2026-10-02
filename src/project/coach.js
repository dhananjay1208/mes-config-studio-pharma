// The coach layer — a per-phase, step-by-step task list with LIVE done
// detection, written for participants who are new to MES. Every done()
// predicate reuses the SAME engine functions acceptance uses (validators,
// deriveScheduleBank, deriveOrderBank, the CORRECT_* maps), so guidance and
// grading are never two truths. Every fix() ("Show me") produces plain
// { path, value } ops dispatched through the normal CONFIG_SET write path.
//
// Rules for this file:
//  - never import from phases.js (phases.js imports POISONED_RUNS and
//    p4MissedRunsHelp from HERE — the dependency points one way only)
//  - done() must be cheap: validators and bank derivations only, never
//    executeRun (live ticks recompute on every config change)
//  - fix() returns null when it cannot act safely (a template line already
//    exists, a machine cannot be resolved by code) — the button hides.
import {
  validatePlantModel, validateMaterials, validateConnectivity, validateQuality,
} from '../engine/validate.js';
import {
  linesOfPlant, silosOf, silosFeedingLine, areaByClass, finishingMachineByClass,
  connectableMachines,
} from '../engine/selectors.js';
import { applyLineTemplate, applySiloTemplates } from '../engine/plantOps.js';
import { deriveOrderBank } from '../engine/orderBank.js';
import { deriveScheduleBank } from '../engine/scheduleCheck.js';
import { buildModelAnswerConfig } from '../data/presets.js';
import {
  LINE_TEMPLATES, SILO_TEMPLATES, PRODUCT_SPEC, MATERIAL_CATALOG,
  SIGNAL_DICTIONARY, DEVICE_CATALOG,
} from '../data/customer.js';
import { CORRECT_ERP_MAP, ORDER_FEED } from '../data/erpFeed.js';
import { CORRECT_APS_MAP, DEPLOY_DAY } from '../data/apsFeed.js';

export const POISONED_RUNS = ['RUN-909', 'RUN-910', 'RUN-911', 'RUN-912', 'RUN-914'];
const POISONED_IDOCS = ['IDOC-9061', 'IDOC-9062', 'IDOC-9063'];
const APS_DISTRACTORS = ['SCEN_ID', 'PLANNER', 'HORIZON_ID'];
const PRIMARY_AREA = { name: 'Blend Supply (IBC fleet)', code: 'PRIM', areaClass: 'primaryFeed' };
const HOLD_MIN = 60;
const CHANGEOVER_PRINTOUT = { sameBlendSameFormatMin: 20, blendChangeMin: 120, formatChangeMin: 180, potentCleanMin: 360 };

const clone = (v) => JSON.parse(JSON.stringify(v));

// The model answer is the single reference for config-independent slices
// (materials, orders, APS, OEE, aggregation). Machine-id-dependent slices
// (connections, tags, track points, inspection plans) are rebuilt from the
// TRAINEE's own nodes instead — see the helpers below.
let _model = null;
const model = () => (_model ??= buildModelAnswerConfig());

const siteIdOf = (config) => config.plantModel.nodes.find((n) => n.type === 'site')?.id ?? null;
const hasLineCode = (config, code) => config.plantModel.nodes.some((n) => n.type === 'line' && n.code === code);
const completeLines = (config) =>
  linesOfPlant(config).filter((L) => L.maker && L.reservoir && L.packer && L.cartoner);

function preferredNode(code, signal) {
  const cat = DEVICE_CATALOG[code];
  if (!cat) return null;
  return cat.nodes.find((n) => n.signal === signal && n.unitScale === 1)
    ?? cat.nodes.find((n) => n.signal === signal) ?? null;
}

function buildConnections(config) {
  const machines = connectableMachines(config);
  if (machines.length === 0) return null;
  return machines.map((m) => ({
    id: `CONN-${m.code}`, machineId: m.id, kind: DEVICE_CATALOG[m.code]?.kind ?? 'opcua',
    endpoint: DEVICE_CATALOG[m.code]?.endpoint ?? '', enabled: true,
  }));
}

function buildTagMap(config) {
  const machines = connectableMachines(config);
  if (machines.length === 0) return null;
  const tags = [];
  for (const m of machines) {
    const dict = SIGNAL_DICTIONARY[m.props.machineClass] ?? [];
    for (const req of dict) {
      const node = preferredNode(m.code, req.signal);
      if (!node) continue;
      tags.push({
        id: `TAG-${m.code}-${req.signal}`, machineId: m.id, signal: req.signal,
        nodeId: node.nodeId, scale: node.unitScale, uom: req.uom, pollMs: 1000,
      });
    }
  }
  return tags;
}

// ---------------------------------------------------------------------------
// The steps. Shape: { id, title, tab, instruction, hint?, done(config, ctx),
// fix(config) -> { explain, ops: [{ path, value }] } | null }
// ---------------------------------------------------------------------------
export const COACH = {
  1: { moduleId: 'plantModel', steps: [
    {
      id: 'p1-silos', title: 'Add the four IBCs (the blend supply)', tab: 'tree',
      instruction: 'IBCs are where the final blend waits for the presses — the batch side of the plant seen as a constraint feed. Add all four (Cardexil 10 mg, Femodyl, Cardexil 20 mg, and the dedicated Zentrix IBC) with their blend lots and released quantities.',
      hint: 'The Plant Modeler has standard templates — look for the IBC/template buttons on the Tree & Properties tab.',
      done: (config) => silosOf(config).length >= 4,
      fix: (config) => {
        const siteId = siteIdOf(config);
        if (!siteId) return null;
        return {
          explain: 'Added IBC-0012 (BLND-CDX10, 380 kg) and IBC-0032 (BLND-FEM25, 60 kg) docking on L3, IBC-0033 (BLND-CDX20, 200 kg) docking on L3 or L5, and IBC-0034 (BLND-ZTX50, potent, 200 kg) docking on L5 only — the blend-availability and docking checks read exactly these.',
          ops: [{ path: ['plantModel', 'nodes'], value: applySiloTemplates(config.plantModel.nodes, siteId, SILO_TEMPLATES, PRIMARY_AREA) }],
        };
      },
    },
    {
      id: 'p1-line3', title: 'Build Line 3 (press → coater/hold → blister → cartoner)', tab: 'tree',
      instruction: 'Every line is the same four-machine chain. The coater with its coated-bulk hold matters most: coated tablets wait in drums, so a blister stop never reaches the press and a press stop never starves the blister — until the hold runs dry.',
      hint: 'Use the "standard line" template for Line 3, then check each machine carries its rated speed.',
      done: (config) => completeLines(config).some((L) => !L.line.props.potentCapable),
      fix: (config) => {
        const siteId = siteIdOf(config);
        if (!siteId || hasLineCode(config, 'L3')) return null;
        return {
          explain: 'Added Line 3 from the template: PR3 (4,000 tab/min) → CO1 (120 min of coated-bulk hold) → BL3 (400 blisters/min) → CR3 (200 cartons/min). 4,000 tablets = 400 blisters = 200 cartons = exactly 1 case per minute.',
          ops: [{ path: ['plantModel', 'nodes'], value: applyLineTemplate(config.plantModel.nodes, siteId, LINE_TEMPLATES.line3) }],
        };
      },
    },
    {
      id: 'p1-line5', title: 'Build Line 5 and flag it potent-segregated', tab: 'tree',
      instruction: 'Line 5 is the plant\'s potent-segregated line with its own coater CO5 — the only place Zentrix 50 mg may legally run, and nothing potent ever touches Line 3 equipment. The potent flag on the line is what the APS docking check will read in Phase 4.',
      done: (config) => completeLines(config).some((L) => Boolean(L.line.props.potentCapable)),
      fix: (config) => {
        const siteId = siteIdOf(config);
        if (!siteId || hasLineCode(config, 'L5')) return null;
        return {
          explain: 'Added Line 5 from the template with potentCapable = true: PR5 → CO5 → BL5 → CR5.',
          ops: [{ path: ['plantModel', 'nodes'], value: applyLineTemplate(config.plantModel.nodes, siteId, LINE_TEMPLATES.line5) }],
        };
      },
    },
    {
      id: 'p1-support', title: 'Model the granulation suite and the shared finishing area', tab: 'tree',
      instruction: 'DSP1 → GRN1 → FBD2 → SIZ1 → BLD1 (+ the coating kitchen CK1) make the blend both presses consume, and the shared case packer + palletizer turn bundles into shippable cases and pallets. Leave them out and the MES never sees the dryer whose NIR probe is about to lie.',
      done: (config) => Boolean(areaByClass(config, 'upstream') && finishingMachineByClass(config, 'casePacker') && finishingMachineByClass(config, 'palletizer')),
      fix: (config) => {
        const siteId = siteIdOf(config);
        if (!siteId) return null;
        let nodes = config.plantModel.nodes;
        let touched = false;
        if (!hasLineCode(config, 'GS1')) { nodes = applyLineTemplate(nodes, siteId, LINE_TEMPLATES.upstream); touched = true; }
        if (!hasLineCode(config, 'FIN1')) { nodes = applyLineTemplate(nodes, siteId, LINE_TEMPLATES.finishing); touched = true; }
        if (!touched) return null;
        return {
          explain: 'Added the Granulation Suite (DSP1, GRN1, FBD2, SIZ1, BLD1, CK1) and the finishing area (CP1 case packer + PZ1 palletizer) from the templates.',
          ops: [{ path: ['plantModel', 'nodes'], value: nodes }],
        };
      },
    },
    {
      id: 'p1-routing', title: 'Set the IBC docking rules', tab: 'feed',
      instruction: 'An IBC that may dock nowhere is decoration. On the Blend Supply tab, let IBC-0012 and IBC-0032 dock on L3, IBC-0033 on L3 or L5, and the Zentrix IBC-0034 on L5 only — the feasibility checks in Phase 4 will trust exactly this routing.',
      done: (config) => {
        const lines = linesOfPlant(config);
        return lines.length > 0 && silosOf(config).length > 0
          && lines.every((L) => silosFeedingLine(config, L.line.code).length > 0);
      },
      fix: (config) => {
        const silos = silosOf(config);
        if (silos.length === 0) return null;
        let touched = false;
        const nodes = config.plantModel.nodes.map((n) => {
          if (n.type !== 'silo') return n;
          const t = SILO_TEMPLATES.find((s) => s.code === n.code)
            ?? SILO_TEMPLATES.find((s) => s.blendCode === n.props.blendCode);
          if (!t) return n;
          touched = true;
          return { ...n, props: { ...n.props, feedsLineCodes: [...t.feedsLineCodes] } };
        });
        if (!touched) return null;
        return {
          explain: 'Set the docking rules by blend: Cardexil 10 mg + Femodyl → L3, Cardexil 20 mg → L3 or L5, Zentrix (potent) → L5 only.',
          ops: [{ path: ['plantModel', 'nodes'], value: nodes }],
        };
      },
    },
    {
      id: 'p1-clean', title: 'Clear the plant-model findings', tab: 'tree',
      instruction: `Scroll to the "Configuration checks" panel at the bottom of the module. Every red error means the plant cannot run at all; make sure both lines are complete, every machine has a rated speed, and each coated-bulk hold decouples at least ${HOLD_MIN} minutes.`,
      done: (config) => {
        const lines = completeLines(config);
        return validatePlantModel(config).filter((f) => f.level === 'error').length === 0
          && lines.length >= 2
          && lines.every((L) => (L.reservoir.props.bufferMin ?? 0) >= HOLD_MIN);
      },
      fix: () => null,
    },
  ] },

  2: { moduleId: 'materials', steps: [
    {
      id: 'p2-skus', title: 'Configure all five SKUs and the four final blends', tab: 'skus',
      instruction: 'The customer sells five SKUs across three product families — including an export variant and one potent product. Anything not configured here will be rejected as an unknown product when the ERP orders arrive in Phase 3.',
      done: (config) =>
        PRODUCT_SPEC.skus.every((s) => config.materials.skus.some((x) => x.code === s.code))
        && PRODUCT_SPEC.blends.every((b) => config.materials.blends.some((x) => x.code === b.code)),
      fix: () => ({
        explain: 'Loaded the customer\'s full portfolio: 5 SKUs (incl. CDX-10-EXP for Italy and the potent ZTX-50) and the 4 final blends.',
        ops: [
          { path: ['materials', 'skus'], value: clone(model().materials.skus) },
          { path: ['materials', 'blends'], value: clone(model().materials.blends) },
        ],
      }),
    },
    {
      id: 'p2-items', title: 'Pull in the material catalog', tab: 'materials',
      instruction: 'Final blends, coating suspensions, blister film and foil, cartons, leaflets, anti-tamper seals, the Italian vignette, shrink film, labels and case blanks — the parts the BOMs will consume. The export carton, the Italian leaflet and the vignette are separate items from the domestic ones; that difference is a trap later.',
      done: (config) => MATERIAL_CATALOG.every((i) => config.materials.items.some((x) => x.id === i.id)),
      fix: () => ({
        explain: 'Loaded all 24 catalog materials — including the separate EXPORT carton (CTN-CDX10-EXP), the Italian leaflet (LFT-CDX-EXP) and the reimbursement vignette (VIG-IT-CDX10).',
        ops: [{ path: ['materials', 'items'], value: clone(model().materials.items) }],
      }),
    },
    {
      id: 'p2-boms', title: 'Build a full BOM for every SKU', tab: 'bom',
      instruction: 'Each BOM names every material a case consumes AND the machine that consumes it — the blend at the press, the suspension at the coater, film and foil at the blister, cartons/leaflets/seals (and the vignette) at the cartoner, case blanks at the case packer. The export SKU must consume the export carton, the Italian leaflet and the vignette.',
      done: (config) => config.materials.boms.length >= PRODUCT_SPEC.skus.length && config.materials.boms.every((b) => b.lines.length >= 8),
      fix: () => ({
        explain: 'Built all five BOMs with consuming machines named — the export SKU consumes CTN-CDX10-EXP, LFT-CDX-EXP and VIG-IT-CDX10, which is what keeps export cartons legal.',
        ops: [{ path: ['materials', 'boms'], value: clone(model().materials.boms) }],
      }),
    },
    {
      id: 'p2-ranges', title: 'Assign serial-number pools for BOTH markets', tab: 'ranges',
      instruction: 'Every carton needs a unique identifier whose serial comes from the L4 serialization provider\'s allocated pool before it can legally exist. Request the DOM and EXP pools and assign each SKU to the pool of its market — the export SKU without an EXP pool cannot be serialized at all.',
      done: (config) =>
        config.materials.uiRanges.some((r) => r.market === 'DOM' && (r.assignedSkus ?? []).length > 0)
        && config.materials.uiRanges.some((r) => r.market === 'EXP' && (r.assignedSkus ?? []).length > 0),
      fix: () => ({
        explain: 'Requested SNP-DOM-01 and SNP-EXP-01 from the L4 provider and assigned every SKU to the pool of its market.',
        ops: [{ path: ['materials', 'uiRanges'], value: clone(model().materials.uiRanges) }],
      }),
    },
    {
      id: 'p2-clean', title: 'Clear the master-data findings', tab: 'bom',
      instruction: 'The findings panel at the bottom is the master-data health check. The classic misses: an export BOM consuming the domestic carton or no vignette, and a BOM with no final blend (which snaps genealogy at the batch/discrete boundary).',
      done: (config) => validateMaterials(config).length === 0,
      fix: () => null,
    },
  ] },

  3: { moduleId: 'orders', steps: [
    {
      id: 'p3-map', title: 'Map the seven IDoc fields', tab: 'interface',
      instruction: 'SAP speaks IDoc (AUFNR, MATNR, MENGE…); the MES speaks orders (orderNo, skuCode, qtyCases…). Map all seven pairs. WERKS (always 2000) and VKORG are SAP bookkeeping — leave them unmapped; a good interface maps what the receiver uses, nothing more.',
      done: (config) => CORRECT_ERP_MAP.every((m) =>
        (config.orders.interfaceMap ?? []).some((r) => r.erpField === m.erpField && r.mesField === m.mesField)),
      fix: () => ({
        explain: 'Mapped AUFNR→orderNo, MATNR→skuCode, MENGE→qtyCases, MEINS→uom, LGDAT→dueDate, PRIO_CD→priority, MARKT→market. WERKS and VKORG stay unmapped.',
        ops: [{ path: ['orders', 'interfaceMap'], value: clone(CORRECT_ERP_MAP) }],
      }),
    },
    {
      id: 'p3-checks', title: 'Enable all four inbound validation checks', tab: 'release',
      instruction: 'Inbound validation is the moat between ERP and the plant. Unknown SKUs, tablet-denominated quantities, missing BOMs and missing serial pools must be caught before planning ever sees the order.',
      done: (config) => {
        const c = config.orders.validationChecks ?? {};
        return Boolean(c.skuValid && c.uomIsCases && c.bomExists && c.uiRangeAssigned);
      },
      fix: () => ({
        explain: 'Enabled all four checks: SKU exists, UoM is cases, a BOM exists, and a serial pool is assigned.',
        ops: [{ path: ['orders', 'validationChecks'], value: { skuValid: true, uomIsCases: true, bomExists: true, uiRangeAssigned: true } }],
      }),
    },
    {
      id: 'p3-inbox', title: 'Work the inbox: accept the week, reject the three poisoned IDocs', tab: 'inbox',
      instruction: 'Three messages are traps: IDOC-9061 orders CDX-40, a strength Helvion never registered; IDOC-9062 sends 1.6 million because the quantity is in TABLETS (SAP "ST" = pieces) not cases; IDOC-9063 has no material code at all. Reject those three; accept the eleven real orders.',
      done: (config) => {
        const d = config.orders.decisions ?? {};
        return ORDER_FEED.every((m) => d[m.msgId])
          && POISONED_IDOCS.every((id) => d[id] === 'rejected');
      },
      fix: () => ({
        explain: 'Accepted the 11 clean orders and rejected IDOC-9061 (unknown SKU), IDOC-9062 (tablets, not cases) and IDOC-9063 (no material).',
        ops: [{ path: ['orders', 'decisions'], value: clone(model().orders.decisions) }],
      }),
    },
    {
      id: 'p3-release', title: 'Set the release rule to cover the week', tab: 'release',
      instruction: 'Validated is not released. The release rule decides which orders the APS schedule may legitimately reference — a horizon of at least 11 releases the whole week, so every scheduled run finds its order.',
      done: (config) => config.orders.releaseRule?.mode === 'horizon' && (config.orders.releaseRule?.horizonOrders ?? 0) >= 11,
      fix: () => ({
        explain: 'Set the release rule to horizon 12 — every validated order of the week is released to scheduling.',
        ops: [{ path: ['orders', 'releaseRule'], value: { mode: 'horizon', horizonOrders: 12 } }],
      }),
    },
    {
      id: 'p3-review', title: 'Confirm the order bank: 11 released, 3 rejected', tab: 'inbox',
      instruction: 'Read the bank the way Phase 4 will: eleven orders released (including the Italian rush call-off that arrived last), three rejected with their reasons on record. This bank is what the Cadence schedule will be checked against.',
      done: (config, ctx) => ctx.orders().released.length >= 10,
      fix: () => null,
    },
  ] },

  4: { moduleId: 'apsIntegration', steps: [
    {
      id: 'p4-map', title: 'Map the Cadence APS schedule message', tab: 'feed',
      instruction: 'Cadence sends raw fields; map the seven the MES needs — SCHED_ID→runId, ORDER_REF→orderNo, LINE_ID→lineCode, SEQ_NO→seq, START_TS→plannedStart, END_TS→plannedEnd, QTY_CS→qtyCases. END_TS matters more than it looks: without it the MES cannot measure the gap between runs, and the changeover check goes blind.',
      done: (config) => CORRECT_APS_MAP.every((m) =>
        (config.apsIntegration.interfaceMap ?? []).some((r) => r.apsField === m.apsField && r.mesField === m.mesField)),
      fix: () => ({
        explain: 'Mapped all seven schedule fields. SCEN_ID, PLANNER and HORIZON_ID stay unmapped — planning metadata the MES has no use for.',
        ops: [{ path: ['apsIntegration', 'interfaceMap'], value: clone(CORRECT_APS_MAP) }],
      }),
    },
    {
      id: 'p4-distractors', title: 'Leave the three distractor fields unmapped', tab: 'feed',
      instruction: 'SCEN_ID, PLANNER and HORIZON_ID are Cadence\'s internal bookkeeping. Real interfaces always carry noise — map what the receiving system uses, nothing more.',
      done: (config) => {
        const map = config.apsIntegration.interfaceMap ?? [];
        return map.length > 0 && !map.some((r) => APS_DISTRACTORS.includes(r.apsField));
      },
      fix: (config) => {
        const map = config.apsIntegration.interfaceMap ?? [];
        if (map.length === 0 || !map.some((r) => APS_DISTRACTORS.includes(r.apsField))) return null;
        return {
          explain: 'Removed the mappings for SCEN_ID, PLANNER and HORIZON_ID.',
          ops: [{ path: ['apsIntegration', 'interfaceMap'], value: map.filter((r) => !APS_DISTRACTORS.includes(r.apsField)) }],
        };
      },
    },
    {
      id: 'p4-checks', title: 'Enable all five feasibility checks', tab: 'checks',
      instruction: 'These are the questions the MES asks about every run before it reaches a line: is the order released? is there enough released blend in an IBC that may dock on this line? does the potent product stay on the segregated line? does the planned gap cover the changeover — including the validated clean? are cartons, vignette and serial pool ready? Each one exists because one of the poisoned runs needs it.',
      done: (config) => {
        const fc = config.apsIntegration.feasibilityChecks ?? {};
        return Boolean(fc.orderReleased && fc.blendAvailable && fc.siloRouting && fc.changeoverRules && fc.materialReadiness);
      },
      fix: () => ({
        explain: 'Enabled all five checks — each of the five poisoned runs in the feed is caught by exactly one of them.',
        ops: [{ path: ['apsIntegration', 'feasibilityChecks'], value: { orderReleased: true, blendAvailable: true, siloRouting: true, changeoverRules: true, materialReadiness: true } }],
      }),
    },
    {
      id: 'p4-changeover', title: 'Tell the MES what a changeover really costs', tab: 'changeover',
      instruction: 'The changeover check compares Cadence\'s planned gaps against THESE numbers — your belief, not the plant\'s physics. The Cadence master-data printout on the planner\'s desk reads 20 / 120 / 180 / 360; copy it exactly. Leave the potent clean at 0 and the MES believes a validated clean is free: RUN-912, planned 30 minutes after a Zentrix run, will sail straight through.',
      hint: 'Strength / market / batch change 20 · product change 120 · format (tooling) change 180 · potent-product clean 360. Higher is not safer: over-stated numbers wrongly block feasible Wednesday runs.',
      done: (config) => {
        const cm = config.apsIntegration.changeoverModel ?? {};
        return cm.sameBlendSameFormatMin === CHANGEOVER_PRINTOUT.sameBlendSameFormatMin
          && cm.blendChangeMin === CHANGEOVER_PRINTOUT.blendChangeMin
          && cm.formatChangeMin === CHANGEOVER_PRINTOUT.formatChangeMin
          && cm.potentCleanMin === CHANGEOVER_PRINTOUT.potentCleanMin;
      },
      fix: () => ({
        explain: 'Set 20 / 120 / 180 / 360 from the Cadence printout — the potent clean (360) is the number that catches RUN-912.',
        ops: [{ path: ['apsIntegration', 'changeoverModel'], value: { ...CHANGEOVER_PRINTOUT } }],
      }),
    },
    {
      id: 'p4-purge', title: 'Enforce the validated potent-product clean', tab: 'changeover',
      instruction: 'Line 5 ran Zentrix 50 mg last night. With enforcement on, the MES dispatches the 360-minute clean, the swab sampling and the QA release into the night window — Line 5 opens released and clean at 06:00 and the day keeps its full eight hours. Off, the first Cardexil 20 mg cases carry a potent API the blister camera cannot see.',
      done: (config) => Boolean(config.apsIntegration.purgeEnforcement?.enabled),
      fix: () => ({
        explain: 'Enabled clean enforcement — the validated clean runs in the night window instead of contaminating the morning.',
        ops: [{ path: ['apsIntegration', 'purgeEnforcement', 'enabled'], value: true }],
      }),
    },
    {
      id: 'p4-gate', title: 'Gate release on errors', tab: 'release',
      instruction: 'A finding that blocks nothing is decoration. Block-on-error holds any run with a feasibility finding as infeasible — the planner hears about it today, while the schedule can still be changed. That is the entire point of validating.',
      done: (config) => config.apsIntegration.releaseGate?.mode === 'blockOnError',
      fix: () => ({
        explain: 'Switched the release gate to Block on error — findings now stop runs instead of decorating them.',
        ops: [{ path: ['apsIntegration', 'releaseGate', 'mode'], value: 'blockOnError' }],
      }),
    },
    {
      id: 'p4-feedback', title: 'Send actuals back to Cadence APS', tab: 'release',
      instruction: 'Close the loop: enable feedback and send at least actualStart, actualEnd and goodCases, so tomorrow\'s schedule is built on what actually happened — not on yesterday\'s fiction.',
      done: (config) => {
        const fb = config.apsIntegration.actualsFeedback ?? {};
        return Boolean(fb.enabled) && (fb.fields ?? []).length >= 3;
      },
      fix: () => ({
        explain: 'Enabled actuals feedback with all four fields and a 15-minute slip threshold for resending shifted completions.',
        ops: [{ path: ['apsIntegration', 'actualsFeedback'], value: { enabled: true, fields: ['actualStart', 'actualEnd', 'goodCases', 'adherenceFlag'], onDelayMin: 15 } }],
      }),
    },
    {
      id: 'p4-review', title: 'Read the schedule bank: 5 blocked, 6 released', tab: 'feed',
      instruction: 'Five runs should now show red findings and status "infeasible" — RUN-909, 910, 911, 912 and 914 — and Wednesday\'s six runs (including the RUN-390 rush call-off) "released". Read WHY on each red run: each one is a different lesson in what an MES protects the plant from.',
      done: (config, ctx) => {
        const bank = ctx.bank();
        const flagged = POISONED_RUNS.filter((id) =>
          bank.entries.some((e) => e.run.runId === id && (e.status === 'infeasible' || e.status === 'rejected')));
        const dayReleased = bank.entries.filter((e) => e.status === 'released' && e.run.day === DEPLOY_DAY).length;
        return flagged.length === POISONED_RUNS.length && dayReleased >= 6;
      },
      fix: () => null,
    },
  ] },

  5: { moduleId: 'connectivity', steps: [
    {
      id: 'p5-connect', title: 'Connect every machine', tab: 'connections',
      instruction: 'A machine with no connection does not exist to the MES — every one of its signals is dark. Connect all sixteen: both full lines (press, coater, blister, cartoner), the six machines of the granulation suite, the case packer and the palletizer.',
      done: (config, ctx) => connectableMachines(config).length > 0
        && !ctx.connFindings().some((f) => f.id.startsWith('cn-conn-')),
      fix: (config) => {
        const conns = buildConnections(config);
        if (!conns) return null;
        return {
          explain: 'Connected every machine to its controller endpoint from the plant device catalog (opc.tcp://<machine>-plc.hp2.local:4840).',
          ops: [{ path: ['connectivity', 'connections'], value: conns }],
        };
      },
    },
    {
      id: 'p5-tags', title: 'Map every dictionary signal to its correct node', tab: 'tagmap',
      instruction: 'The signal dictionary is what the MES NEEDS per machine; the device catalog is what each controller OFFERS. Bind each required signal to the right node — a wrong-but-real node faithfully records the wrong number, which is worse than recording nothing.',
      hint: 'Watch the traps: TabCountK looks like a tablet counter but 1 raw = 1,000 tablets; WeightTmg is tenths of a milligram, not milligrams.',
      done: (config, ctx) => (config.connectivity.tagMap ?? []).length > 0
        && !ctx.connFindings().some((f) => f.id.startsWith('cn-tag-') || f.id.startsWith('cn-node-') || f.id.startsWith('cn-cross-')),
      fix: (config) => {
        const tags = buildTagMap(config);
        if (!tags || tags.length === 0) return null;
        return {
          explain: 'Mapped every dictionary signal to its correct unit-scale-1 node (TabCount not TabCountK, WeightMg not WeightTmg), 1-second polling.',
          ops: [{ path: ['connectivity', 'tagMap'], value: tags }],
        };
      },
    },
    {
      id: 'p5-scale', title: 'Fix scaling and sampling', tab: 'sampling',
      instruction: 'A wrong scale multiplies reality — performance over 100% always means a counter scale is lying. And counters or state words polled slower than 3 seconds miss the 6–9 second foil-splice stops entirely.',
      done: (config, ctx) => !ctx.connFindings().some((f) => f.id.startsWith('cn-scale-') || f.id.startsWith('cn-poll-')),
      fix: (config) => {
        const tags = config.connectivity.tagMap ?? [];
        if (tags.length === 0) return null;
        const machines = new Map(connectableMachines(config).map((m) => [m.id, m]));
        let touched = false;
        const next = tags.map((t) => {
          const code = machines.get(t.machineId)?.code;
          const node = DEVICE_CATALOG[code]?.nodes.find((n) => n.nodeId === t.nodeId);
          if (!node) return t;
          const pollMs = (t.pollMs ?? 1000) > 3000 ? 1000 : (t.pollMs ?? 1000);
          if (t.scale === node.unitScale && pollMs === (t.pollMs ?? 1000)) return t;
          touched = true;
          return { ...t, scale: node.unitScale, pollMs };
        });
        if (!touched) return null;
        return {
          explain: 'Corrected every tag\'s scale to its node\'s unit scale and brought slow polls back to 1 second.',
          ops: [{ path: ['connectivity', 'tagMap'], value: next }],
        };
      },
    },
    {
      id: 'p5-quality', title: 'Turn on stale-data and flatline detection', tab: 'quality',
      instruction: 'Bad data does not look bad — it looks good. A frozen NIR probe on FBD2 reads a comfortable 2.1 % all morning while the real LOD drifts out of the 1.5–2.5 % window and a wet sub-lot heads for the press; a dropped controller leaves "running" on the board forever. Flatline and stale-data detection are how the MES notices.',
      done: (config) => {
        const r = config.connectivity.signalRules ?? {};
        return (r.staleTimeoutSec ?? 0) > 0 && Boolean(r.flatline?.enabled) && (r.flatline?.windowMin ?? 0) > 0;
      },
      fix: () => ({
        explain: 'Set stale timeout to 15 s and flatline detection to a 15-minute window — the frozen NIR probe will now be caught before its sub-lot is pressed.',
        ops: [{ path: ['connectivity', 'signalRules'], value: { staleTimeoutSec: 15, flatline: { enabled: true, windowMin: 15 } } }],
      }),
    },
  ] },

  6: { moduleId: 'traceability', steps: [
    {
      id: 'p6-track', title: 'Put track points on press, coater, blister and cartoner', tab: 'track',
      instruction: 'Batches must leave events: batch start at each press (where the IBC docks and the order becomes a batch), coated-batch start at each coater (suspension lot), blister-lot start at each blister (film and foil lots), and batch complete at each cartoner (where cartons get their identity). Without them, lot consumption has no event to hang on.',
      done: (config) => {
        const lines = linesOfPlant(config);
        const tps = config.traceability.trackPoints ?? [];
        const has = (m) => Boolean(m) && tps.some((tp) => tp.machineId === m.id);
        return lines.length > 0 && lines.every((L) => has(L.maker) && has(L.cartoner)
          && (!L.reservoir || has(L.reservoir)) && (!L.packer || has(L.packer)));
      },
      fix: (config) => {
        const lines = linesOfPlant(config).filter((L) => L.maker && L.cartoner);
        if (lines.length === 0) return null;
        const tps = [];
        for (const L of lines) {
          tps.push({ id: `TP-${L.maker.code}-S`, machineId: L.maker.id, event: 'runStart', idLevel: 'run' });
          if (L.reservoir) tps.push({ id: `TP-${L.reservoir.code}-S`, machineId: L.reservoir.id, event: 'runStart', idLevel: 'run' });
          if (L.packer) tps.push({ id: `TP-${L.packer.code}-S`, machineId: L.packer.id, event: 'runStart', idLevel: 'run' });
          tps.push({ id: `TP-${L.cartoner.code}-C`, machineId: L.cartoner.id, event: 'runComplete', idLevel: 'ui' });
        }
        return {
          explain: 'Added batch-start track points at both presses, coaters and blisters, and batch-complete (carton UI level) at both cartoners.',
          ops: [{ path: ['traceability', 'trackPoints'], value: tps }],
        };
      },
    },
    {
      id: 'p6-serial', title: 'Serialize at the cartoner — print, verify, void on fail', tab: 'serial',
      instruction: 'A UI belongs to a CARTON, so it is printed and verified at the cartoner\'s serialization station only — never at the blister, never at the case packer. Camera-verify every DataMatrix and void failed cartons; a detected-but-shipped bad print fails at the pharmacy as a suspected falsified medicine.',
      done: (config) => {
        const s = config.traceability.serialization ?? {};
        return s.uiPrintMachineClass === 'cartoner' && Boolean(s.cameraVerify) && Boolean(s.voidOnFail);
      },
      fix: () => ({
        explain: 'UI printing set to the cartoner\'s serialization station with 100% camera verify and void-on-fail.',
        ops: [{ path: ['traceability', 'serialization'], value: { uiPrintMachineClass: 'cartoner', cameraVerify: true, voidOnFail: true } }],
      }),
    },
    {
      id: 'p6-agg', title: 'Build the aggregation ladder: carton → bundle → case → pallet', tab: 'agg',
      instruction: 'Aggregation is the chain of custody: 10 cartons to a bundle (scanned at the cartoner outfeed), 20 bundles to a case (case packer), 48 cases to a pallet SSCC (palletizer). FMD does not mandate it — Helvion builds it for the warehouse and DSCSA-readiness. A missing level is a recall measured in opened boxes.',
      done: (config) => {
        const levels = config.traceability.aggregation?.levels ?? [];
        const has = (lv) => levels.some((l) => l.level === lv);
        return has('carton') && has('case') && has('pallet');
      },
      fix: () => ({
        explain: 'Configured bundle ×10 at the cartoner outfeed, case ×20 bundles at the case packer, and pallet SSCC (48 cases) at the palletizer.',
        ops: [{ path: ['traceability', 'aggregation'], value: clone(model().traceability.aggregation) }],
      }),
    },
    {
      id: 'p6-gene', title: 'Capture genealogy: IBC blend lot + tracked materials', tab: 'gene',
      instruction: 'Genealogy answers "what went into this carton?". Capture the IBC blend lot at the press (the batch→discrete handoff) and scan the lot-tracked materials at consumption — suspension, film, foil, cartons, leaflets, seals, vignettes, labels.',
      done: (config) => {
        const g = config.traceability.genealogy ?? {};
        return Boolean(g.blendLotCapture) && (g.materialLotCapture ?? []).length > 0;
      },
      fix: () => ({
        explain: 'Enabled IBC blend-lot capture at the press and lot scanning for every lot-tracked catalog material.',
        ops: [{ path: ['traceability', 'genealogy'], value: { blendLotCapture: true, materialLotCapture: MATERIAL_CATALOG.filter((i) => i.lotTracked).map((i) => i.id) } }],
      }),
    },
    {
      id: 'p6-repo', title: 'Upload to the EU Hub, with buffer-and-retry', tab: 'repo',
      instruction: 'Every serial goes to the EU Hub (EMVO) before release, and the aggregation and shipping events follow as EPCIS — a carton whose serial never reached the Hub fails verification at the pharmacy. Buffer-and-retry matters: the first network wobble must not silently drop uploads.',
      done: (config) => {
        const r = config.traceability.repository ?? {};
        return Boolean(r.enabled) && Boolean(r.partnerId) && Boolean(r.bufferAndRetry);
      },
      fix: () => ({
        explain: 'Enabled FMD upload to the EU Hub via the L4 EPCIS gateway with buffer-and-retry.',
        ops: [{ path: ['traceability', 'repository'], value: { enabled: true, partnerId: 'EU-HUB', bufferAndRetry: true } }],
      }),
    },
  ] },

  7: { moduleId: 'oee', steps: [
    {
      id: 'p7-states', title: 'Build the equipment state model', tab: 'states',
      instruction: 'Six buckets cover a packaging line\'s day: Running, Starved, Blocked, Breakdown, Changeover / line clearance, Idle. Every minute of the shift will be classified into exactly one of them — no bucket, no classification.',
      done: (config) => (config.oee.stateModel ?? []).length >= 6,
      fix: () => ({
        explain: 'Loaded the six standard states: Running (production), Starved/Blocked/Breakdown (unplanned), Changeover (planned), Idle (not scheduled).',
        ops: [{ path: ['oee', 'stateModel'], value: clone(model().oee.stateModel) }],
      }),
    },
    {
      id: 'p7-words', title: 'Map the state words for every machine class', tab: 'words',
      instruction: 'Machines report a raw state word (1 = running … 6 = idle — frozen across this plant\'s controllers); this table translates each word into your state model. An unmapped word lands in "Unclassified" — and an unclassified stop is a stop nobody will ever fix.',
      done: (config) => {
        const wm = config.oee.stateWordMap ?? {};
        return ['maker', 'packer'].every((cls) => [1, 2, 3, 4, 5, 6].every((w) => (wm[cls] ?? {})[w]));
      },
      fix: (config) => {
        const modelIds = model().oee.stateModel.map((s) => s.id);
        if (!modelIds.every((id) => (config.oee.stateModel ?? []).some((s) => s.id === id))) return null;
        return {
          explain: 'Mapped words 1–6 to the standard states for every machine class — lines, finishing and the granulation suite.',
          ops: [{ path: ['oee', 'stateWordMap'], value: clone(model().oee.stateWordMap) }],
        };
      },
    },
    {
      id: 'p7-reasons', title: 'Build a downtime reason tree', tab: 'reasons',
      instruction: 'When an operator classifies a stop, these are the choices. Equipment (punches, foil splice, printhead), Material (vignette, cartons, blend supply), Minor stops, Organizational — deep enough to act on, shallow enough to actually get used.',
      done: (config) => (config.oee.reasonTree ?? []).length >= 3,
      fix: () => ({
        explain: 'Loaded a four-branch reason tree: Equipment, Material, Minor stops, Organizational.',
        ops: [{ path: ['oee', 'reasonTree'], value: clone(model().oee.reasonTree) }],
      }),
    },
    {
      id: 'p7-calendar', title: 'Set the calendar: breaks and the short-stop threshold', tab: 'calendar',
      instruction: 'Both daily breaks (08:30 ×15, 11:00 ×30) go in as planned stops — or lunch gets booked as a 30-minute breakdown. The 3-minute short-stop threshold keeps foil splices as performance loss instead of formal downtime events.',
      done: (config) => (config.oee.shortStopThresholdMin ?? 0) > 0 && (config.oee.calendar?.breaks ?? []).length >= 2,
      fix: () => ({
        explain: 'Added both breaks as planned stops and set the short-stop threshold to 3 minutes.',
        ops: [
          { path: ['oee', 'shortStopThresholdMin'], value: 3 },
          { path: ['oee', 'calendar'], value: clone(model().oee.calendar) },
        ],
      }),
    },
  ] },

  8: { moduleId: 'quality', steps: [
    {
      id: 'p8-spc', title: 'SPC on both presses (tablet weight + hardness)', tab: 'plans',
      instruction: 'The IPC auto-tester on each press streams tablet weight and hardness; an SPC plan watches them against spec (250 mg ± 5 %, 80–140 N). Note the cross-module truth: this plan only SEES data if the IPC tags were mapped in Shopfloor Connectivity.',
      done: (config) => {
        const lines = linesOfPlant(config);
        const plans = config.quality.inspectionPlans ?? [];
        return lines.length > 0 && lines.every((L) => L.maker
          && plans.some((p) => p.machineId === L.maker.id && p.source === 'inlineGauge' && (p.checks ?? []).length >= 2));
      },
      fix: (config) => {
        const makers = linesOfPlant(config).map((L) => L.maker).filter(Boolean);
        if (makers.length === 0) return null;
        const plans = [...(config.quality.inspectionPlans ?? [])];
        let touched = false;
        for (const mk of makers) {
          if (plans.some((p) => p.machineId === mk.id && p.source === 'inlineGauge')) continue;
          touched = true;
          plans.push({
            id: `IP-${mk.code}-SPC`, machineId: mk.id, source: 'inlineGauge', n: 1,
            checks: [
              { characteristic: 'tabletWeight', spec: 'SKU target ± 5 %', reaction: 'andon' },
              { characteristic: 'hardness', spec: '80–140 N', reaction: 'hold' },
            ],
          });
        }
        if (!touched) return null;
        return {
          explain: 'Added IPC SPC plans on every press: tablet weight (andon) and hardness (hold).',
          ops: [{ path: ['quality', 'inspectionPlans'], value: plans }],
        };
      },
    },
    {
      id: 'p8-firstoff', title: 'Line clearance + first-off after every changeover', tab: 'plans',
      instruction: 'The first cases after a product change are where potent residue and wrong cartons hide. A first-off plan at each press (identity, appearance, residue swab) holds them until someone looks — and opens the eBR only after the clearance is signed.',
      done: (config) => {
        const lines = linesOfPlant(config);
        const plans = config.quality.inspectionPlans ?? [];
        return lines.length > 0 && lines.every((L) => L.maker
          && plans.some((p) => p.machineId === L.maker.id && p.source === 'firstOff'));
      },
      fix: (config) => {
        const makers = linesOfPlant(config).map((L) => L.maker).filter(Boolean);
        if (makers.length === 0) return null;
        const plans = [...(config.quality.inspectionPlans ?? [])];
        let touched = false;
        for (const mk of makers) {
          if (plans.some((p) => p.machineId === mk.id && p.source === 'firstOff')) continue;
          touched = true;
          plans.push({
            id: `IP-${mk.code}-FO`, machineId: mk.id, source: 'firstOff', n: 1,
            checks: [{ characteristic: 'line clearance + first-off (identity, appearance, residue swab)', spec: 'no residue, correct blend lot, eBR opened', reaction: 'hold' }],
          });
        }
        if (!touched) return null;
        return {
          explain: 'Added a line-clearance / first-off hold after every changeover on both presses — potent residue is caught before it reaches quarantine as "good".',
          ops: [{ path: ['quality', 'inspectionPlans'], value: plans }],
        };
      },
    },
    {
      id: 'p8-checkweigher', title: 'Checkweigh the cases', tab: 'plans',
      instruction: 'The case packer\'s checkweigher (Modbus TCP) catches short cases (19 bundles instead of 20). One plan, one characteristic — and again, it reads the caseWeightKg tag from Phase 5.',
      done: (config) => {
        const cp = finishingMachineByClass(config, 'casePacker');
        const plans = config.quality.inspectionPlans ?? [];
        return Boolean(cp) && plans.some((p) => p.machineId === cp.id && p.source === 'checkweigher');
      },
      fix: (config) => {
        const cp = finishingMachineByClass(config, 'casePacker');
        if (!cp) return null;
        const plans = config.quality.inspectionPlans ?? [];
        if (plans.some((p) => p.machineId === cp.id && p.source === 'checkweigher')) return null;
        return {
          explain: 'Added the checkweigher plan on the case packer — short cases are held instead of shipped.',
          ops: [{ path: ['quality', 'inspectionPlans'], value: [...plans, {
            id: `IP-${cp.code}-CW`, machineId: cp.id, source: 'checkweigher', n: 1,
            checks: [{ characteristic: 'caseWeight', spec: '20 bundles (200 cartons) — 5.4 kg ± 2 %', reaction: 'hold' }],
          }] }],
        };
      },
    },
    {
      id: 'p8-containment', title: 'Containment: hold severity-3, block their serial pools', tab: 'containment',
      instruction: 'Detection without containment still ships the defect. Severity-3 (metal, potent cross-contamination, UI failure, missing leaflet) must physically hold cases AND block the affected serial pool; severity-2 holds cases.',
      done: (config) => {
        const c = config.quality.containment ?? [];
        return c.some((r) => (r.minSeverity ?? 99) <= 3 && r.action === 'holdCases')
          && c.some((r) => (r.minSeverity ?? 99) <= 3 && r.action === 'blockUiRange')
          && c.some((r) => (r.minSeverity ?? 99) <= 2 && r.action === 'holdCases');
      },
      fix: () => ({
        explain: 'Added the three containment rules: sev-3 hold + serial-pool block, sev-2 hold.',
        ops: [{ path: ['quality', 'containment'], value: clone(model().quality.containment) }],
      }),
    },
    {
      id: 'p8-crosscheck', title: 'Clear the quality findings (the Phase 5 cross-check)', tab: 'plans',
      instruction: 'A plan that reads an unmapped tag inspects nothing. If the findings panel says a plan\'s signal is dark, the fix is not here — it is back in Shopfloor Connectivity, where that tag was never mapped.',
      done: (config) => validateQuality(config).length === 0,
      fix: () => null,
    },
  ] },
};

/** Ordered steps for a phase, or []. */
export function coachSteps(phaseId) {
  return COACH[phaseId]?.steps ?? [];
}

/**
 * Live progress for a phase: { steps: [{...step, done}], doneCount, total,
 * firstOpenIndex } — or null when the phase has no coach script (P0, P9).
 */
export function coachProgress(config, phaseId) {
  const def = COACH[phaseId];
  if (!def) return null;
  let _bank = null;
  let _orders = null;
  let _conn = null;
  const ctx = {
    bank: () => (_bank ??= deriveScheduleBank(config)),
    orders: () => (_orders ??= deriveOrderBank(config)),
    connFindings: () => (_conn ??= validateConnectivity(config)),
  };
  const steps = def.steps.map((s) => {
    let done = false;
    try { done = Boolean(s.done(config, ctx)); } catch { done = false; }
    return { ...s, done };
  });
  const doneCount = steps.filter((s) => s.done).length;
  const firstOpenIndex = steps.findIndex((s) => !s.done);
  return { moduleId: def.moduleId, steps, doneCount, total: steps.length, firstOpenIndex };
}

// ---------------------------------------------------------------------------
// P4 diagnostics — turns a bare "yours: 4/5" into the reason and the fix
// location. Returns { hint, moduleId, tab } or null when nothing is missed.
// ---------------------------------------------------------------------------
export function p4MissedRunsHelp(config) {
  const a = config.apsIntegration ?? {};
  const fc = a.feasibilityChecks ?? {};
  const bank = deriveScheduleBank(config);
  const flagged = new Set(bank.entries
    .filter((e) => e.status === 'infeasible' || e.status === 'rejected')
    .map((e) => e.run.runId));
  const missed = POISONED_RUNS.filter((id) => !flagged.has(id));
  if (missed.length === 0) return null;

  if ((a.releaseGate?.mode ?? 'autoAccept') !== 'blockOnError') {
    return {
      hint: 'Findings are computed but the release gate is auto-accept, so nothing is ever blocked. Switch to Block on error.',
      moduleId: 'apsIntegration', tab: 'release',
    };
  }

  const mapped = new Set((a.interfaceMap ?? []).map((r) => r.mesField).filter(Boolean));
  const cm = a.changeoverModel ?? {};
  const parts = [];
  let tab = 'feed';

  for (const id of missed) {
    if (id === 'RUN-914' || id === 'RUN-909') {
      if (!fc.siloRouting) {
        parts.push(`${id} (Zentrix 50 mg on Line 3) slipped through: the siloRouting check is OFF.`);
        tab = 'checks';
      } else {
        parts.push(`${id} (Zentrix 50 mg on Line 3) slipped through with siloRouting ON — check the plant model: L3 must not be potent-segregated and no BLND-ZTX50 IBC may dock on it.`);
      }
    } else if (id === 'RUN-910') {
      if (!fc.blendAvailable) {
        parts.push('RUN-910 slipped through: the blendAvailable check is OFF — 240 cases of Cardexil 20 mg against 200 kg of released blend goes unquestioned.');
        tab = 'checks';
      } else {
        parts.push('RUN-910 slipped through with blendAvailable ON — IBC-0033 (Cardexil 20 mg) should hold 200 kg of released blend; check Plant Modeler → Blend Supply.');
      }
    } else if (id === 'RUN-911') {
      if (!fc.orderReleased) {
        parts.push('RUN-911 slipped through: the orderReleased check is OFF — it references PO-78899, an order ERP never sent.');
        tab = 'checks';
      } else {
        parts.push('RUN-911 slipped through with orderReleased ON — PO-78899 should not appear in the released order bank; check Order Management.');
      }
    } else if (id === 'RUN-912') {
      if (!fc.changeoverRules) {
        parts.push('RUN-912 slipped through: the changeoverRules check is OFF — Cardexil 20 mg is planned 30 minutes after a Zentrix run that needs a 360-minute validated clean.');
        tab = 'checks';
      } else if (!mapped.has('plannedEnd')) {
        parts.push('RUN-912 slipped through: END_TS is not mapped to plannedEnd, so the MES cannot measure the gap after the Zentrix run before it. Map it on the Schedule Feed tab.');
        tab = 'feed';
      } else {
        const prev913 = bank.entries.find((e) => e.run.runId === 'RUN-913');
        if (prev913 && prev913.status !== 'accepted' && prev913.status !== 'released') {
          parts.push('RUN-912\'s clean conflict only becomes visible once RUN-913 (the Zentrix run before it on Line 5) parses and is accepted — check that PO-77239 is released (Phase 3) and Line 5 is modeled potent-segregated with the Zentrix IBC docking there (Phase 1).');
        } else {
          parts.push(`RUN-912 slipped through: your changeover model says a potent-product clean takes ${cm.potentCleanMin ?? 0} min — Cadence's printout says 360. Set it on the Changeover Rules tab.`);
          tab = 'changeover';
        }
      }
    }
  }

  return { hint: parts.join(' '), moduleId: 'apsIntegration', tab };
}
