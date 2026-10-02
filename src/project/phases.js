// The guided Helvion Pharma deployment — the consultant arc
// (requirements → configuration → integration → go-live), phase by phase.
// Each phase carries a customer requirement excerpt (HP2-REQ-2xx) and an
// acceptance function returning [{ ok, label }] — same validators and the
// SAME run engine as Deploy & Run, so acceptance is never a separate truth.
import {
  validatePlantModel, validateMaterials, validateOrders, validateApsIntegration,
  validateConnectivity, validateTraceability, validateOee, validateQuality,
} from '../engine/validate.js';
import { linesOfPlant, silosOf, silosFeedingLine, areaByClass, finishingMachineByClass } from '../engine/selectors.js';
import { deriveOrderBank } from '../engine/orderBank.js';
import { deriveScheduleBank } from '../engine/scheduleCheck.js';
import { executeRun } from '../engine/execution.js';
import { CORRECT_ERP_MAP } from '../data/erpFeed.js';
import { CORRECT_APS_MAP, DEPLOY_DAY } from '../data/apsFeed.js';
import { PRODUCT_SPEC } from '../data/customer.js';
import { POISONED_RUNS, p4MissedRunsHelp } from './coach.js';

// help (optional): { hint, moduleId, tab } — serializable strings only; check
// results are persisted into project.phases. Labels never change here: the
// coach layer is additive, and tests freeze the label strings.
const check = (ok, label, help) => ({ ok: Boolean(ok), label, ...(help ? { help } : {}) });

// Calibration constants (see CLAUDE.md "Physics & calibration"): the model
// answer plans 445 cases on Wednesday and produces all of them.
export const PLANNED_DAY_CASES = 445;
export const MIN_HOLD_DECOUPLING_MIN = 60;

export const PHASES = [
  {
    id: 0, title: 'Kickoff', moduleId: null, req: 'ENGAGEMENT',
    brief: 'Helvion Pharma has signed Helvion Digital Consulting to configure ForgeMES for Plant 2 Lakeworth: two compression-coating-packaging lines (Line 5 potent-segregated with its own coater), a granulation suite feeding an IBC fleet, shared case packing and palletizing, five SKUs across three product families — and EU FMD obligations that make every carton a legal document and every batch unsellable until a QP certifies its record. One thing is fixed in the contract: production scheduling stays in Cadence APS. ForgeMES receives the schedule, validates it, executes it and reports back. It never re-sequences. Read the brief, accept the engagement, and work the phases in order.',
    accept: null, // accepted by button
  },
  {
    id: 1, title: 'Model the plant', moduleId: 'plantModel', req: 'HP2-REQ-201',
    brief: '"The MES shall reflect the physical plant: two lines (tablet press, pan coater with a coated-bulk hold of at least 60 minutes, blister machine, cartoner with serialization station), Line 5 potent-segregated; the granulation suite; shared case packing and palletizing; and the IBC fleet with its docking rules. Every machine shall carry its rated speed."',
    accept: (config) => {
      const f = validatePlantModel(config);
      const lines = linesOfPlant(config);
      const complete = lines.filter((L) => L.maker && L.reservoir && L.packer && L.cartoner);
      const holdsOk = complete.length >= 2 && complete.every((L) => (L.reservoir.props.bufferMin ?? 0) >= MIN_HOLD_DECOUPLING_MIN);
      const silos = silosOf(config);
      const allFed = lines.length > 0 && lines.every((L) => silosFeedingLine(config, L.line.code).length > 0);
      return [
        check(f.filter((x) => x.level === 'error').length === 0, 'Plant model is routable (no validation errors)',
          { hint: 'Open Plant Modeler and clear every red error in the "Configuration checks" panel at the bottom.', moduleId: 'plantModel', tab: 'tree' }),
        check(complete.length >= 2, `Two complete lines (press → coater/hold → blister → cartoner) — yours: ${complete.length}`,
          { hint: 'Add Line 3 and Line 5 from the standard line templates — each needs press → coater + hold → blister → cartoner/serialization.', moduleId: 'plantModel', tab: 'tree' }),
        check(holdsOk, `Every coated-bulk hold decouples ≥ ${MIN_HOLD_DECOUPLING_MIN} minutes`,
          { hint: `Set each coater's coated-bulk hold to at least ${MIN_HOLD_DECOUPLING_MIN} minutes in its properties — coated tablets wait in drums, the press and the blister are not one machine.`, moduleId: 'plantModel', tab: 'tree' }),
        check(lines.some((L) => L.line.props.potentCapable), 'A potent-segregated line exists',
          { hint: 'Flag Line 5 as potent-segregated in its line properties.', moduleId: 'plantModel', tab: 'tree' }),
        check(silos.length >= 4 && allFed, `Four routed IBCs docking on the lines (yours: ${silos.length} IBCs)`,
          { hint: 'Add the four IBCs and set their docking rules on the Blend Supply tab: IBC-0012/0032 → L3, IBC-0033 → L3 + L5, IBC-0034 (Zentrix) → L5 only.', moduleId: 'plantModel', tab: 'feed' }),
        check(Boolean(finishingMachineByClass(config, 'casePacker') && finishingMachineByClass(config, 'palletizer') && areaByClass(config, 'upstream')), 'Granulation suite and shared finishing modeled',
          { hint: 'Add the Granulation Suite (DSP1 … CK1) and the finishing area (case packer + palletizer) from the templates.', moduleId: 'plantModel', tab: 'tree' }),
      ];
    },
  },
  {
    id: 2, title: 'Products & materials', moduleId: 'materials', req: 'HP2-REQ-202',
    brief: '"All five SKUs shall be orderable, each with a BOM naming the consuming machine for every material. The export variant shall carry the Italian carton, leaflet and reimbursement vignette. Serial-number pools from the L4 serialization provider shall be assigned per market before anything is produced."',
    accept: (config) => {
      const f = validateMaterials(config);
      return [
        check(config.materials.skus.length >= PRODUCT_SPEC.skus.length, `All ${PRODUCT_SPEC.skus.length} SKUs configured (yours: ${config.materials.skus.length})`,
          { hint: 'Add all five SKUs and the four final blends on the SKUs & Blends tab.', moduleId: 'materials', tab: 'skus' }),
        check(config.materials.boms.length >= PRODUCT_SPEC.skus.length && config.materials.boms.every((b) => b.lines.length >= 8), 'A full BOM per SKU (≥ 8 lines, consuming machines named)',
          { hint: 'Every SKU needs a BOM of at least 8 lines, each naming its consuming machine (BOMs tab).', moduleId: 'materials', tab: 'bom' }),
        check(config.materials.uiRanges.some((r) => r.market === 'DOM' && (r.assignedSkus ?? []).length > 0) && config.materials.uiRanges.some((r) => r.market === 'EXP' && (r.assignedSkus ?? []).length > 0), 'Serial-number pools assigned for BOTH markets',
          { hint: 'Request the DOM and EXP serial pools and assign SKUs to BOTH markets (Serial Pools & Vignettes tab).', moduleId: 'materials', tab: 'ranges' }),
        check(f.length === 0, 'No master-data findings (incl. export carton & vignette)',
          { hint: 'Open the findings panel in Products & Materials — the export carton & vignette trap usually lives here.', moduleId: 'materials', tab: 'bom' }),
      ];
    },
  },
  {
    id: 3, title: 'Orders & ERP interface', moduleId: 'orders', req: 'HP2-REQ-203',
    brief: '"Process orders arrive weekly from SAP S/4HANA as IDoc messages. The interface shall map every order attribute, inbound validation shall reject malformed orders — unknown SKUs, wrong units of measure — before planning sees them, and a release rule shall feed the week to the schedule."',
    accept: (config) => {
      const mapOk = CORRECT_ERP_MAP.every((m) =>
        (config.orders.interfaceMap ?? []).some((r) => r.erpField === m.erpField && r.mesField === m.mesField));
      const checks = config.orders.validationChecks;
      const bank = deriveOrderBank(config);
      const poisonedCaught = bank.entries.filter((e) => e.status === 'error' || e.status === 'rejected').length >= 3;
      return [
        check(mapOk, 'All seven order fields mapped to the correct IDoc fields',
          { hint: 'Map all seven IDoc fields (AUFNR→orderNo, MATNR→skuCode …). WERKS and VKORG stay unmapped.', moduleId: 'orders', tab: 'interface' }),
        check(checks.skuValid && checks.uomIsCases && checks.bomExists && checks.uiRangeAssigned, 'All inbound validation checks enabled',
          { hint: 'Enable all four inbound validation checks on the Validation & Release tab.', moduleId: 'orders', tab: 'release' }),
        check(poisonedCaught, 'The three malformed IDocs are caught',
          { hint: 'Reject IDOC-9061 (unknown SKU CDX-40), IDOC-9062 (tablets, not cases) and IDOC-9063 (no material) in the Order Inbox.', moduleId: 'orders', tab: 'inbox' }),
        check(bank.released.length >= 10, `The week's orders released (yours: ${bank.released.length}/11)`,
          { hint: 'Accept the clean orders and set the release rule to a horizon of at least 11.', moduleId: 'orders', tab: 'release' }),
      ];
    },
  },
  {
    id: 4, title: 'APS integration', moduleId: 'apsIntegration', req: 'HP2-REQ-204',
    brief: '"Cadence APS sends the sequenced schedule per line. The MES shall validate feasibility — released orders, IBC quantities and docking rules including potent segregation, changeover rules including the validated potent-product clean, material readiness — gate release on errors, and feed actuals back to Cadence. The MES shall never re-sequence."',
    accept: (config) => {
      const a = config.apsIntegration;
      const mapOk = CORRECT_APS_MAP.every((m) =>
        (a.interfaceMap ?? []).some((r) => r.apsField === m.apsField && r.mesField === m.mesField));
      const fc = a.feasibilityChecks ?? {};
      const bank = deriveScheduleBank(config);
      const flagged = POISONED_RUNS.filter((id) =>
        bank.entries.some((e) => e.run.runId === id && (e.status === 'infeasible' || e.status === 'rejected')));
      const dayReleased = bank.entries.filter((e) => e.status === 'released' && e.run.day === DEPLOY_DAY).length;
      return [
        check(mapOk, 'All seven schedule fields mapped correctly',
          { hint: 'Map all seven schedule fields on the Schedule Feed tab; SCEN_ID, PLANNER and HORIZON_ID stay unmapped.', moduleId: 'apsIntegration', tab: 'feed' }),
        check(fc.orderReleased && fc.blendAvailable && fc.siloRouting && fc.changeoverRules && fc.materialReadiness, 'All five feasibility checks enabled',
          { hint: 'Enable all five feasibility checks.', moduleId: 'apsIntegration', tab: 'checks' }),
        check(a.releaseGate?.mode === 'blockOnError', 'Release gate blocks infeasible runs',
          { hint: 'Switch the release gate to Block on error.', moduleId: 'apsIntegration', tab: 'release' }),
        check(flagged.length === POISONED_RUNS.length, `All five infeasible runs blocked (yours: ${flagged.length}/5)`,
          flagged.length === POISONED_RUNS.length ? null : p4MissedRunsHelp(config)),
        check(dayReleased >= 6, `Wednesday's six runs released (yours: ${dayReleased})`,
          { hint: 'Wednesday should release six runs including the RUN-390 rush call-off. If fewer, a feasible run is being wrongly blocked (changeover numbers above the printout?) or its order/materials are missing.', moduleId: 'apsIntegration', tab: 'feed' }),
        check(a.purgeEnforcement?.enabled, 'Potent-product clean dispatched to the night window',
          { hint: 'Enable "Enforce the validated potent-product clean" on the Changeover Rules tab.', moduleId: 'apsIntegration', tab: 'changeover' }),
        check(a.actualsFeedback?.enabled && (a.actualsFeedback.fields ?? []).length >= 3, 'Actuals feedback to Cadence APS configured',
          { hint: 'Enable actuals feedback and send at least three fields (Release & Feedback tab).', moduleId: 'apsIntegration', tab: 'release' }),
      ];
    },
  },
  {
    id: 5, title: 'Shopfloor connectivity', moduleId: 'connectivity', req: 'HP2-REQ-205',
    brief: '"Every machine shall be connected — the lines, the finishing area and the granulation suite — its full signal set mapped in correct engineering units, counters and state words sampled fast enough to see 6–9 second foil-splice stops, and analog signals guarded by flatline and stale-data detection. The MES shall record what the plant does — not what the last good value was."',
    accept: (config) => {
      const f = validateConnectivity(config);
      const run = executeRun(config);
      const grid = run.connectivity.grid;
      const missed = grid.reduce((s, r) => s + (r.missedStops ?? 0), 0);
      const detected = grid.reduce((s, r) => s + (r.detectedStops ?? 0), 0);
      const perfOk = run.oee.perLine.every((l) => l.performance == null || l.performance <= 1.01);
      return [
        check(f.length === 0, 'No connectivity findings (every signal mapped, correctly scaled)',
          { hint: 'Connect every machine, map every dictionary signal, fix scales and polling — work the four tabs left to right.', moduleId: 'connectivity', tab: 'connections' }),
        check(run.kpis.dataFidelity >= 0.95, `Data fidelity ≥ 95% (yours: ${Math.round(run.kpis.dataFidelity * 100)}%)`,
          { hint: 'Wrong node bindings or scales record the wrong number — check Tag Mapping and Sampling & Scaling.', moduleId: 'connectivity', tab: 'tagmap' }),
        check(missed === 0 && detected >= 8, `Every in-production stop visible to the sampling (missed: ${missed})`,
          { hint: 'Counters and state words must poll at ≤ 3 s to see the 6–9 s foil-splice stops (a stop needs two samples inside it).', moduleId: 'connectivity', tab: 'sampling' }),
        check(perfOk, 'Recorded performance ≤ 100% (counter scaling is honest)',
          { hint: 'Performance over 100% means a counter scale is lying — the TabCountK (×1,000) and WeightTmg (×10) traps.', moduleId: 'connectivity', tab: 'sampling' }),
        check(run.connectivity.frozenCaught, 'The frozen NIR probe on FBD2 is caught by the flatline rule',
          { hint: 'Map FBD2\'s NIR moisture signal and enable flatline detection on the Signal Quality tab.', moduleId: 'connectivity', tab: 'quality' }),
      ];
    },
  },
  {
    id: 6, title: 'Track & trace', moduleId: 'traceability', req: 'HP2-REQ-206',
    brief: '"Every carton shall carry a verified FMD unique identifier printed at the cartoner\'s serialization station, aggregated carton → bundle → case → pallet SSCC, with genealogy from the IBC blend lot to the carton, and every serial and aggregation event uploaded to the EU Hub. A carton whose serial never reached the Hub cannot be dispensed — and a batch without it cannot be released."',
    accept: (config) => {
      const f = validateTraceability(config);
      const run = executeRun(config);
      return [
        check(f.length === 0, 'No traceability findings',
          { hint: 'Work the five tabs: track points, serialization at the cartoner, aggregation, genealogy, EU Hub.', moduleId: 'traceability', tab: 'track' }),
        check(run.identityFindings.length === 0, 'ORDER → BATCH → UI lifecycle intact (UIs only at the serialization station)',
          { hint: 'UIs are printed and verified at the cartoner\'s serialization station ONLY — check the Serialization tab.', moduleId: 'traceability', tab: 'serial' }),
        check(run.kpis.unserializedPacks === 0 && run.kpis.unverifiedShippedPacks === 0, 'Every shipped carton serialized AND verified',
          { hint: 'Enable camera verify and void-on-fail so nothing unverified ships.', moduleId: 'traceability', tab: 'serial' }),
        check(run.kpis.aggregationGaps === 0, 'Zero aggregation gaps (full carton→bundle→case→pallet tree)',
          { hint: 'Configure all three levels: bundle ×10 at the cartoner outfeed, case ×20 bundles at the case packer, pallet SSCC at the palletizer.', moduleId: 'traceability', tab: 'agg' }),
        check(run.kpis.genealogyGaps === 0, 'Zero genealogy capture gaps',
          { hint: 'Enable IBC blend-lot capture at the press, put track points on press, coater and blister, and tick every lot-tracked material.', moduleId: 'traceability', tab: 'gene' }),
        check(run.kpis.repositoryFailed === 0 && run.kpis.repositoryReported > 0, `EU Hub clean (${run.kpis.repositoryReported} events sent, ${run.kpis.repositoryFailed} failed)`,
          { hint: 'Enable EU Hub upload with buffer-and-retry.', moduleId: 'traceability', tab: 'repo' }),
      ];
    },
  },
  {
    id: 7, title: 'OEE & downtime', moduleId: 'oee', req: 'HP2-REQ-207',
    brief: '"Every stop shall be classified from the machines\' own state words: breaks as planned stops, breakdowns with a reason, micro-stops below a sensible threshold as performance loss. Target ≥ 90% classification accuracy against the day\'s actual events — the packaging OEE journey from 45.0 to 63.5 starts with a number the plant can trust."',
    accept: (config) => {
      const f = validateOee(config);
      const run = executeRun(config);
      return [
        check(f.length === 0, 'No OEE configuration findings',
          { hint: 'Build the state model first — without it no minute can be classified.', moduleId: 'oee', tab: 'states' }),
        check((config.oee.calendar.breaks ?? []).length >= 2, 'Both daily breaks in the calendar',
          { hint: 'Add both breaks (08:30 ×15, 11:00 ×30) as planned stops on the Calendar tab.', moduleId: 'oee', tab: 'calendar' }),
        check(run.kpis.classificationAccuracy >= 0.9, `Classification accuracy ≥ 90% (yours: ${Math.round(run.kpis.classificationAccuracy * 100)}%)`,
          { hint: 'Map state words 1–6 for every machine class — unmapped words land in Unclassified.', moduleId: 'oee', tab: 'words' }),
        check(run.kpis.unclassifiedMin <= 5, `Unclassified time ≤ 5 min (yours: ${Math.round(run.kpis.unclassifiedMin)} min)`,
          { hint: 'Unclassified time usually means missing state-word mappings or missing breaks.', moduleId: 'oee', tab: 'words' }),
      ];
    },
  },
  {
    id: 8, title: 'Quality & containment', moduleId: 'quality', req: 'HP2-REQ-208',
    brief: '"The IPC auto-testers shall be watched by SPC, a line clearance and first-off inspection shall follow every changeover, and cases shall be checkweighed. Severity-3 defects shall be physically held and their serial pools blocked. Nothing defective, cross-contaminated or unverified shall reach quarantine as releasable stock."',
    accept: (config) => {
      const run = executeRun(config);
      const sev3 = run.quality.results.filter((d) => (d.severity ?? 0) >= 3 && !d.autoRejected);
      return [
        check((config.quality.inspectionPlans ?? []).length >= 4, 'At least four inspection plans placed',
          { hint: 'You need SPC on both presses, first-off after changeovers, and the case checkweigher.', moduleId: 'quality', tab: 'plans' }),
        check(run.kpis.defectsEscaped === 0, `No defect escapes detection (escaped: ${run.kpis.defectsEscaped})`,
          { hint: 'An escape means no plan watches that defect\'s signal — and IPC plans only see tags mapped in Phase 5.', moduleId: 'quality', tab: 'plans' }),
        check(sev3.every((d) => d.detected), 'Every severity-3 defect is caught',
          { hint: 'Severity-3 defects need detecting plans AND containment.', moduleId: 'quality', tab: 'containment' }),
        check(run.kpis.defectsShipped === 0, 'Zero defective cases shipped',
          { hint: 'Add containment rules: hold severity ≥ 2, block serial pools at severity 3.', moduleId: 'quality', tab: 'containment' }),
      ];
    },
  },
  {
    id: 9, title: 'Go-live', moduleId: null, req: 'CUT-OVER',
    brief: 'All eight configuration areas are accepted. Run the go-live production day — one Wednesday at Plant 2 Lakeworth — present the results to the customer, and sign the acceptance protocol.',
    accept: (config) => {
      const run = executeRun(config);
      return [
        check(run.kpis.producedCases >= PLANNED_DAY_CASES - 15, `Day volume produced (${run.kpis.producedCases}/${PLANNED_DAY_CASES} cases)`,
          { hint: 'Fewer cases than planned usually means a Wednesday run was wrongly blocked or starved — check the schedule bank and the IBC docking rules.', moduleId: 'apsIntegration', tab: 'feed' }),
        check(run.kpis.scheduleAdherence >= 0.85, `Schedule adherence ≥ 85% (yours: ${Math.round(run.kpis.scheduleAdherence * 100)}%)`,
          { hint: 'Slips come from changeover beliefs that differ from the printout and from an unenforced potent clean.', moduleId: 'apsIntegration', tab: 'changeover' }),
        check((run.kpis.oee ?? 0) >= 0.5, `Line OEE ≥ 50% (yours: ${run.kpis.oee != null ? Math.round(run.kpis.oee * 100) : '—'}%)`,
          { hint: 'Low OEE with clean config is real physics (a 3-hour tooling change is a 3-hour tooling change); impossibly HIGH numbers mean counter scaling lies.', moduleId: 'connectivity', tab: 'sampling' }),
        check((run.kpis.fpy ?? 0) >= 0.975, `First pass yield ≥ 97.5% (yours: ${run.kpis.fpy != null ? (run.kpis.fpy * 100).toFixed(1) : '—'}%)`,
          { hint: 'FPY drops when defects escape detection — check inspection plans and the tags they read.', moduleId: 'quality', tab: 'plans' }),
        check(run.kpis.defectsShipped === 0, 'Nothing defective shipped',
          { hint: 'Containment rules hold what detection catches — severity ≥ 2 holds, severity 3 also blocks the serial pool.', moduleId: 'quality', tab: 'containment' }),
        check(run.kpis.repositoryFailed === 0, 'EU Hub upload clean',
          { hint: 'Enable buffer-and-retry so a network wobble cannot drop serial uploads.', moduleId: 'traceability', tab: 'repo' }),
        check(run.kpis.dataFidelity >= 0.95, `Data fidelity ≥ 95% (yours: ${Math.round(run.kpis.dataFidelity * 100)}%)`,
          { hint: 'Fidelity is recorded-vs-reality — unmapped signals, wrong nodes, wrong scales.', moduleId: 'connectivity', tab: 'tagmap' }),
      ];
    },
  },
];

export function phaseById(id) {
  return PHASES.find((p) => p.id === id) ?? null;
}

/** Run a phase's acceptance. Returns { checks, passed, stars }. */
export function checkPhase(config, phaseId) {
  const phase = phaseById(phaseId);
  if (!phase?.accept) return { checks: [], passed: true, stars: 3 };
  const checks = phase.accept(config);
  const okCount = checks.filter((c) => c.ok).length;
  const passed = okCount === checks.length;
  const stars = passed ? 3 : okCount >= checks.length * 0.75 ? 2 : okCount >= checks.length * 0.5 ? 1 : 0;
  return { checks, passed, stars };
}

/** Module locking for guided mode. */
export function moduleUnlocked(state, modulePhase) {
  if (state.meta.mode !== 'guided' || state.ui.instructorMode) return true;
  return modulePhase <= (state.project.currentPhase ?? 0);
}
