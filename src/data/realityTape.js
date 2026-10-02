// The reality tape: ONE scripted virtual production day at Plant 2 Lakeworth,
// identical for every trainee. The tape is ground truth — configuration
// determines what the MES SEES and what the plant SHIPS, never what happened.
//
// Incidents bind by { scope, lineIndex, machineClass } — never by machine id —
// so the tape works against whatever plant the trainee models. lineIndex is
// the line's position in flow order (0 = Line 3, 1 = Line 5 when built from
// templates). Machine classes: maker = tablet press, reservoir = coater +
// coated-bulk hold, packer = blister machine, cartoner = cartoner +
// serialization station.

export const SHIFT = { startMin: 0, endMin: 480, label: '06:00 – 14:00' };

// Shift-clock helper: minute 0 = 06:00.
export function clockLabel(min) {
  const total = 6 * 60 + Math.round(min);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const BREAKS = [
  { id: 'BRK-TEA', startMin: 150, durationMin: 15, label: 'Tea break' },
  { id: 'BRK-LUNCH', startMin: 300, durationMin: 30, label: 'Lunch' },
];

// trueCategory is the ground truth the OEE module tries to reconstruct.
// Durations are minutes; the foil-splice micro-stops are 6–9 SECONDS each
// (0.10–0.15 min) — the canon's slow-polling trap: invisible at 30-s polling.
export const INCIDENTS = [
  // Foil-splice micro-stops on Line 3's blister machine (fault 5203) — 9
  // events inside the production windows, about a minute in total. Individually trivial; collectively the
  // day's sneakiest loss. Only visible if the blister state word is mapped
  // AND sampled fast enough (a 6-second stop needs two samples inside it).
  { id: 'INC-SPLICE-1', where: { scope: 'line', lineIndex: 0, machineClass: 'packer' }, startMin: 22, durationMin: 0.10, trueCategory: 'shortStop', reason: 'Foil-splice micro-stop (5203)', reasonClass: 'minor' },
  { id: 'INC-SPLICE-2', where: { scope: 'line', lineIndex: 0, machineClass: 'packer' }, startMin: 47, durationMin: 0.15, trueCategory: 'shortStop', reason: 'Foil-splice micro-stop (5203)', reasonClass: 'minor' },
  { id: 'INC-SPLICE-3', where: { scope: 'line', lineIndex: 0, machineClass: 'packer' }, startMin: 71, durationMin: 0.12, trueCategory: 'shortStop', reason: 'Foil-splice micro-stop (5203)', reasonClass: 'minor' },
  { id: 'INC-SPLICE-4', where: { scope: 'line', lineIndex: 0, machineClass: 'packer' }, startMin: 118, durationMin: 0.10, trueCategory: 'shortStop', reason: 'Foil-splice micro-stop (5203)', reasonClass: 'minor' },
  { id: 'INC-SPLICE-5', where: { scope: 'line', lineIndex: 0, machineClass: 'packer' }, startMin: 137, durationMin: 0.13, trueCategory: 'shortStop', reason: 'Foil-splice micro-stop (5203)', reasonClass: 'minor' },
  { id: 'INC-SPLICE-6', where: { scope: 'line', lineIndex: 0, machineClass: 'packer' }, startMin: 189, durationMin: 0.15, trueCategory: 'shortStop', reason: 'Foil-splice micro-stop (5203)', reasonClass: 'minor' },
  { id: 'INC-SPLICE-7', where: { scope: 'line', lineIndex: 0, machineClass: 'packer' }, startMin: 214, durationMin: 0.10, trueCategory: 'shortStop', reason: 'Foil-splice micro-stop (5203)', reasonClass: 'minor' },
  { id: 'INC-SPLICE-8', where: { scope: 'line', lineIndex: 0, machineClass: 'packer' }, startMin: 443, durationMin: 0.12, trueCategory: 'shortStop', reason: 'Foil-splice micro-stop (5203)', reasonClass: 'minor' },
  { id: 'INC-SPLICE-9', where: { scope: 'line', lineIndex: 0, machineClass: 'packer' }, startMin: 466, durationMin: 0.15, trueCategory: 'shortStop', reason: 'Foil-splice micro-stop (5203)', reasonClass: 'minor' },

  // Export vignette (bollino) shortage at CR3 during the Cardexil EXPORT rush
  // batch — the lot-tracked fiscal material ran out mid-run.
  { id: 'INC-VIGNETTE', where: { scope: 'line', lineIndex: 0, machineClass: 'cartoner' }, startMin: 195, durationMin: 12, trueCategory: 'unplannedStop', reason: 'Export vignette (bollino) shortage at the serialization station', reasonClass: 'material' },

  // PR5 punch overload (fault 3104) — emergency punch-set change mid-run.
  // The coated-bulk hold in front of BL5 absorbs it; the press's controller
  // also drops offline for four minutes (see SIGNAL_FAULTS).
  { id: 'INC-PUNCH', where: { scope: 'line', lineIndex: 1, machineClass: 'maker' }, startMin: 340, durationMin: 18, trueCategory: 'unplannedStop', reason: 'Punch overload (3104) — emergency punch-set change', reasonClass: 'equipment' },

  // Shared finishing hiccup.
  { id: 'INC-CASEPK', where: { scope: 'shared', machineClass: 'casePacker' }, startMin: 388, durationMin: 3, trueCategory: 'shortStop', reason: 'Case-blank misfeed', reasonClass: 'minor' },
];

// Data-quality ground truth — the connectivity module's reality. These are
// faults of the SIGNALS, not of the machines.
export const SIGNAL_FAULTS = [
  // The inline NIR moisture probe on the fluid-bed dryer FBD2 freezes at
  // 2.1 % LOD while the true moisture drifts wet to 2.7 % (window 1.5–2.5 %).
  // A flatline rule catches it; without one the control room reads a
  // comfortable lie, the dryer discharges a wet sub-lot, and the QC lab's
  // LOD-oven result arrives hours later — after the sub-lot (IBC-0012's
  // second fill) has already docked on PR3 for the export rush batch.
  {
    id: 'SF-FROZEN-NIR', machineCode: 'FBD2', machineClass: 'dryer', signal: 'lodPct',
    lineIndex: 0,
    startMin: 30, endMin: 120, frozenValue: 2.1,
    trueDrift: { from: 2.1, to: 2.7 }, outOfSpecFromMin: 90,
    // When the wet sub-lot is pressed on Line 3 (cases made in this window are the
    // ones that carry the excursion).
    affectsWindow: [185, 232],
    baseline: 2.0, breathe: 0.08, traceWindow: [0, 180],
  },
  // During the punch change, PR5's controller drops offline for 4 minutes.
  // With staleTimeoutSec = 0 the last state word ("running") is trusted forever.
  {
    id: 'SF-STATE-DROP', lineIndex: 1, machineClass: 'maker', signal: 'stateWord',
    startMin: 340, endMin: 344,
  },
];

// Defects are ALWAYS injected — detection and containment are config's job.
export const FIXED_DEFECTS = [
  // Hardness drift on PR3 during the Cardexil 10 mg batch: tablets creep toward
  // the low hardness limit but stay inside the press's force auto-reject band —
  // only an SPC plan on the (mapped!) IPC hardness signal sees it.
  { id: 'DEF-HARD', lineIndex: 0, defectCode: 'HARD-DEV', window: [40, 85], badCaseCount: 6, desc: 'Hardness drift 110 → 84 N — inside the press force window, outside the hardness spec' },
  // Printhead degradation on CR3's serialization station (2205) across the
  // export batches: 240 cartons with unreadable DataMatrix codes. Camera verify
  // voids them; without it they ship.
  { id: 'DEF-UI', lineIndex: 0, defectCode: 'UI-FAIL', window: [110, 232], packCount: 240, desc: 'Printhead degradation (2205) — unreadable DataMatrix UIs on export cartons' },
  // Seal defects from foil-splice recoveries (auto-rejected by the seal inspection).
  { id: 'DEF-SEAL', lineIndex: 0, defectCode: 'SEAL-DMG', packCount: 120, desc: 'Seal / foil-splice damage — cartons-worth of blisters auto-rejected' },
  // Case packer misload late in the day: two 19-bundle (190-carton) cases.
  { id: 'DEF-CASE', shared: true, defectCode: 'CASE-SHORT', caseCount: 2, atMin: 425, desc: 'Case packer misload — 19-bundle (190-carton) cases' },
];

// Conditional (physics-gated) defects — injected by the engine when the
// matching configuration is missing:
//  XCONT-POT — first contaminationCasesIfNoPurge cases of the first Line 5
//              run, when apsIntegration.purgeEnforcement is OFF (Zentrix
//              residue from last night in a Cardexil batch).
//  LOD-OOS   — Line 3 cases pressed from the wet sub-lot (SF-FROZEN-NIR
//              affectsWindow), when no flatline rule catches the probe.

export const PHYSICS = {
  // Actual changeover durations (truth) — the canon ladder. The trainee's
  // changeoverModel is a BELIEF used for feasibility & the planned timeline;
  // reality is this.
  changeoverMin: {
    sameBlendSameFormat: 20,   // batch / strength / market change, same family & tooling (line clearance)
    blendChange: 120,          // product change, minor clean, same tooling
    formatChange: 180,         // format / tooling change
    potentClean: 360,          // potent product: full clean + swab + QA release (+ lab wait)
  },
  // Line 5 ran Zentrix 50 mg last night. With clean enforcement ON the MES
  // dispatched the 360-min validated clean into the night window (costs
  // nothing today); OFF → the first Cardexil 20 mg cases carry Zentrix residue.
  potentCleanOwedOnLineIndex: 1,
  contaminationCasesIfNoPurge: 8,

  lodWindow: { lo: 1.5, hi: 2.5 },

  // Unit hierarchy (canon, legible on purpose): 10 tablets/blister ·
  // 2 blisters/carton · 10 cartons/bundle · 20 bundles/case = 200 cartons =
  // 4,000 tablets per case. Press 4,000 tab/min & blister 400/min ⇒ 1 case/min.
  tabletsPerCase: 4000,
  blistersPerCase: 400,
  cartonsPerCase: 200,        // the UI-bearing unit (engine "packs")
  bundlesPerCase: 20,
  tabletsPerCarton: 20,
  casesPerPallet: 48,
  // kg of blend per case DEFAULT (250 mg tablets: 4,000 × 250 mg = 1.000 kg).
  // Per-SKU value derives from the tablet weight — see caseKg().
  kgPerCase: 1,

  // Base process rejects (fractions of throughput) — the quality "noise floor"
  // the reject counters should report even on a clean day.
  baseRejects: { maker: 0.012, packer: 0.004 },

  // A stop is DETECTED only if its duration ≥ microStopDetectFactor × poll
  // period of the machine's state tag. 6–9 s splices vanish at ≥ 5 s polling.
  microStopDetectFactor: 2,

  // A run whose IBC routing yields no feed is abandoned after this many
  // minutes of starvation (operators give up) — zero cases produced.
  starveGiveUpMin: 30,

  uiVerifyCatchRate: 1.0,          // camera catches ALL bad prints when enabled
  repositoryRejectsUnverified: true,
  staleDropoutRecordedAs: 'running',

  adherenceToleranceMin: 20,       // a run "starts on time" within ± this

  // Identity law: the carton UI is printed & verified ONLY at the cartoner's
  // serialization station (engine machine class 'cartoner').
  uiPrintMachineClass: 'cartoner',

  // € economics (training-grade, deliberately simple): a case not shipped, a
  // defective case shipped (recall exposure), an unserialized carton, a failed
  // EU-Hub upload.
  euro: { caseNotShipped: 600, defectiveCaseShipped: 4000, unserializedCarton: 2, repositoryFailure: 1000 },
};

/** kg of final blend one case of a SKU consumes (4,000 tablets × tablet weight). */
export function caseKg(sku) {
  const mg = Number(sku?.targetTabletWeightMg);
  if (Number.isFinite(mg) && mg > 0) return (PHYSICS.tabletsPerCase * mg) / 1e6;
  return PHYSICS.kgPerCase;
}
