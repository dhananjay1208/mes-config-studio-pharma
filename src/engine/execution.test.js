// Differential tests: the model answer runs a clean day; each test breaks ONE
// configuration knob and asserts the damage becomes visible in the results.
import { describe, it, expect } from 'vitest';
import { executeRun } from './execution.js';
import { buildModelAnswerConfig } from '../data/presets.js';
import { SHIFT, PHYSICS } from '../data/realityTape.js';

const clone = (c) => JSON.parse(JSON.stringify(c));
const model = buildModelAnswerConfig();
const good = executeRun(model);

/** Break one thing, re-run. */
function broken(mutate) {
  const c = clone(model);
  mutate(c);
  return executeRun(c);
}

describe('the clean day (model answer)', () => {
  it('is deterministic — same config, same results', () => {
    expect(JSON.stringify(executeRun(model).kpis)).toBe(JSON.stringify(good.kpis));
  });

  it('runs both lines and produces the whole plan', () => {
    expect(good.lines).toHaveLength(2);
    expect(good.runs).toHaveLength(6);
    expect(good.kpis.producedCases).toBe(good.kpis.plannedCases);
    expect(good.kpis.scheduleAdherence).toBeGreaterThanOrEqual(0.9);
  });

  it('never runs past the end of the shift', () => {
    for (const r of good.runs) expect(r.actualEnd).toBeLessThanOrEqual(SHIFT.endMin);
  });

  it('honours the identity law: no UI before the serialization station', () => {
    expect(good.identityFindings).toEqual([]);
    expect(good.trace.perRun.every((p) => p.serialized)).toBe(true);
  });

  it('catches every defect and ships nothing defective', () => {
    expect(good.kpis.defectsEscaped).toBe(0);
    expect(good.kpis.defectsShipped).toBe(0);
    expect(good.kpis.heldCases).toBeGreaterThan(0); // holding IS the correct outcome
  });

  it('records the plant faithfully', () => {
    expect(good.kpis.dataFidelity).toBeGreaterThanOrEqual(0.95);
    expect(good.kpis.classificationAccuracy).toBeGreaterThanOrEqual(0.9);
    expect(good.kpis.unclassifiedMin).toBeLessThanOrEqual(5);
    expect(good.kpis.oeeTrusted).toBe(true);
  });

  it('uploads everything to the EU Hub and reports to Cadence APS', () => {
    expect(good.kpis.repositoryFailed).toBe(0);
    expect(good.kpis.repositoryReported).toBeGreaterThan(0);
    expect(good.kpis.apsFeedbackSent).toBeGreaterThanOrEqual(6);
  });

  it('never loses more line time than the tape actually took away', () => {
    for (const L of good.lines) {
      const stopped = L.truth.packerSegs
        .filter((s) => s.state === 'fault' || s.state === 'blocked' || s.state === 'starved')
        .reduce((sum, s) => sum + (s.end - s.start), 0);
      const incidentMin = good.truth.incidents.reduce((sum, i) => sum + i.durationMin, 0);
      expect(stopped).toBeLessThanOrEqual(incidentMin + 1e-9);
    }
  });

  // Pharma legible math: press 4,000 tab/min = blister 400/min = cartoner 200/min = 1 case/min.
  it('every line runs at exactly one case per minute', () => {
    for (const L of good.lines) expect(L.lineRate).toBeCloseTo(1, 9);
  });
});

describe('connectivity misconfiguration', () => {
  it('unmapped reject counters make FPY lie by omission', () => {
    const r = broken((c) => { c.connectivity.tagMap = c.connectivity.tagMap.filter((t) => !t.signal.startsWith('rej')); });
    expect(r.kpis.fpy).toBeGreaterThan(r.kpis.fpyTruth);
    expect(r.kpis.fpy).toBe(1);
    expect(r.oee.perLine.every((l) => l.rejVisible)).toBe(false);
  });

  it('a mis-scaled counter reports impossible performance and flatters OEE', () => {
    const r = broken((c) => {
      for (const t of c.connectivity.tagMap) {
        if (t.signal === 'prodCount' && t.nodeId.includes('.Prod.BlisterCount')) {
          t.scale = 4; // operator "fixed" the units by guessing
        }
      }
    });
    expect(r.oee.perLine.some((l) => l.performance > 1.01)).toBe(true);
    // The recorded count diverges from what the plant actually made...
    expect(r.oee.perLine.some((l) => l.recordedCases > l.truthCases)).toBe(true);
    // ...and the KPI it feeds comes out HIGHER than the honest configuration.
    // That is the lesson: bad data does not look bad, it looks good — which is
    // why the run refuses to certify the number.
    expect(r.kpis.oee).toBeGreaterThan(good.kpis.oee);
    expect(r.kpis.oeeTrusted).toBe(false);
    expect(r.kpis.oeeTrustIssues.join(' ')).toMatch(/scaling/);
  });

  // Pharma: 6–9 s foil splices vanish at the 30-s "slow poll" of the canon.
  it('30-second sampling hides the foil-splice micro-stops', () => {
    const r = broken((c) => { for (const t of c.connectivity.tagMap) if (t.signal === 'stateWord') t.pollMs = 30000; });
    const missed = r.connectivity.grid.reduce((s, x) => s + (x.missedStops ?? 0), 0);
    expect(missed).toBeGreaterThan(0);
    expect(r.oee.perLine.some((l) => l.buckets.unaccounted > 0)).toBe(true);
    expect(r.kpis.dataFidelity).toBeLessThan(good.kpis.dataFidelity);
  });

  it('no flatline rule ships the wet sub-lot the frozen NIR probe on FBD2 hid', () => {
    const r = broken((c) => { c.connectivity.signalRules.flatline = { enabled: false, windowMin: 0 }; });
    const lod = r.quality.results.find((d) => d.defectCode === 'LOD-OOS');
    expect(r.connectivity.frozenCaught).toBe(false);
    expect(lod.detected).toBe(false);
    expect(lod.shipped).toBeGreaterThan(0);
    expect(r.kpis.defectsShipped).toBeGreaterThan(0);
  });

  it('the frozen probe is caught on FBD2, not on the press', () => {
    const row = good.connectivity.grid.find((g) => g.machineCode === 'FBD2' && g.signal === 'lodPct');
    expect(row?.frozen?.caught).toBe(true);
    expect(good.connectivity.signalEvents.some((e) => e.kind === 'flatline' && /FBD2/.test(e.msg))).toBe(true);
  });

  it('an unmapped state word turns the whole day into unclassified time', () => {
    const r = broken((c) => { c.connectivity.tagMap = c.connectivity.tagMap.filter((t) => t.signal !== 'stateWord'); });
    expect(r.kpis.unclassifiedMin).toBeGreaterThan(100);
    expect(r.kpis.classificationAccuracy).toBeLessThan(0.3);
  });

  it('an empty state-word map is just as blind as no signal at all', () => {
    const r = broken((c) => { c.oee.stateWordMap = {}; });
    expect(r.kpis.unclassifiedMin).toBeGreaterThan(100);
    expect(r.kpis.classificationAccuracy).toBeLessThan(0.3);
  });

  it('a disconnected machine takes all of its signals dark', () => {
    const r = broken((c) => { c.connectivity.connections = c.connectivity.connections.filter((x) => !x.id.includes('BL3')); });
    expect(r.connectivity.grid.some((g) => g.machineCode === 'BL3' && g.status === 'noConnection')).toBe(true);
    expect(r.kpis.dataFidelity).toBeLessThan(good.kpis.dataFidelity);
  });

  it('a stale-data timeout catches the PR5 controller dropout during the punch change', () => {
    expect(good.connectivity.staleCaught).toBe(true);
    const r = broken((c) => { c.connectivity.signalRules.staleTimeoutSec = 0; });
    expect(r.connectivity.staleCaught).toBe(false);
    expect(r.kpis.dataFidelity).toBeLessThan(good.kpis.dataFidelity);
  });
});

describe('APS integration misconfiguration', () => {
  it('accepting the infeasible runs starves a line and loses the afternoon', () => {
    const r = broken((c) => {
      c.apsIntegration.feasibilityChecks = {
        orderReleased: false, blendAvailable: false, siloRouting: false,
        changeoverRules: false, materialReadiness: false,
      };
      c.apsIntegration.releaseGate.mode = 'autoAccept';
    });
    expect(r.runs.some((x) => x.starved)).toBe(true);
    expect(r.runs.some((x) => x.qtyProduced === 0)).toBe(true);
    expect(r.kpis.producedCases).toBeLessThan(r.kpis.plannedCases * 0.9);
    expect(r.kpis.scheduleAdherence).toBeLessThan(good.kpis.scheduleAdherence);
  });

  it('no clean enforcement cross-contaminates the first Cardexil 20 mg cases', () => {
    const r = broken((c) => { c.apsIntegration.purgeEnforcement.enabled = false; });
    const x = r.quality.results.find((d) => d.defectCode === 'XCONT-POT');
    expect(x).toBeTruthy();
    expect(x.cases).toBe(PHYSICS.contaminationCasesIfNoPurge);
  });

  it('contamination ships when nothing inspects the first case off a changeover', () => {
    const r = broken((c) => {
      c.apsIntegration.purgeEnforcement.enabled = false;
      c.quality.inspectionPlans = c.quality.inspectionPlans.filter((p) => p.source !== 'firstOff');
    });
    const x = r.quality.results.find((d) => d.defectCode === 'XCONT-POT');
    expect(x.detected).toBe(false);
    expect(x.shipped).toBeGreaterThan(0);
  });

  it('feedback disabled leaves Cadence APS planning on fiction', () => {
    const r = broken((c) => { c.apsIntegration.actualsFeedback = { enabled: false, fields: [], onDelayMin: 0 }; });
    expect(r.kpis.apsFeedbackSent).toBe(0);
    expect(r.integrationLog.some((m) => m.system === 'APS')).toBe(false);
  });
});

describe('traceability misconfiguration', () => {
  it('a missing EXP serial pool stops the export runs at the release gate', () => {
    const r = broken((c) => { c.materials.uiRanges = c.materials.uiRanges.filter((x) => x.market !== 'EXP'); });
    // With the gate armed, material readiness catches it before 06:00: the
    // export runs are never released, so volume is lost but nothing illegal
    // is produced. That is the MES doing its job.
    expect(r.runs.some((x) => x.sku?.market === 'EXP')).toBe(false);
    expect(r.kpis.plannedCases).toBeLessThan(good.kpis.plannedCases);
    expect(r.kpis.unserializedPacks).toBe(0);
  });

  it('a missing EXP serial pool with an open gate produces unserializable cartons', () => {
    const r = broken((c) => {
      c.materials.uiRanges = c.materials.uiRanges.filter((x) => x.market !== 'EXP');
      c.apsIntegration.releaseGate.mode = 'autoAccept';
    });
    expect(r.kpis.unserializedPacks).toBeGreaterThan(0);
    expect(r.kpis.repositoryFailed).toBeGreaterThan(0);
  });

  it('no camera verify ships unreadable DataMatrix codes the EU Hub rejects', () => {
    const r = broken((c) => { c.traceability.serialization.cameraVerify = false; });
    expect(r.kpis.unverifiedShippedPacks).toBeGreaterThan(0);
    expect(r.kpis.uiVerifyRate).toBeLessThan(1);
    expect(r.kpis.repositoryFailed).toBeGreaterThan(0);
  });

  it('dropping case aggregation opens gaps in the chain of custody', () => {
    const r = broken((c) => { c.traceability.aggregation.levels = c.traceability.aggregation.levels.filter((l) => l.level !== 'case'); });
    expect(r.kpis.aggregationGaps).toBeGreaterThan(0);
    expect(r.integrationLog.some((m) => m.type === 'AGGREGATION' && m.status !== 'sent')).toBe(true);
  });

  it('no IBC blend-lot capture snaps the chain at the batch/discrete boundary', () => {
    const r = broken((c) => { c.traceability.genealogy.blendLotCapture = false; });
    expect(r.kpis.genealogyGaps).toBeGreaterThan(0);
    expect(r.trace.perRun.every((p) => !p.blendLotCaptured)).toBe(true);
  });

  // Pharma identity law: the UI belongs to the carton — printing it at the blister is a violation.
  it('printing UIs at the blister machine is an identity violation', () => {
    const r = broken((c) => { c.traceability.serialization.uiPrintMachineClass = 'packer'; });
    expect(r.identityFindings.length).toBeGreaterThan(0);
    expect(r.kpis.unserializedPacks).toBeGreaterThan(0);
  });

  it('upload disabled means the batch can never be released', () => {
    const r = broken((c) => { c.traceability.repository.enabled = false; });
    expect(r.kpis.repositoryReported).toBe(0);
    expect(r.integrationLog.some((m) => m.system === 'EU-HUB')).toBe(false);
  });
});

describe('OEE and quality misconfiguration', () => {
  it('an empty break calendar books lunch as unexplained downtime', () => {
    const r = broken((c) => { c.oee.calendar.breaks = []; });
    expect(r.kpis.unclassifiedMin).toBeGreaterThan(30);
    expect(r.kpis.classificationAccuracy).toBeLessThan(good.kpis.classificationAccuracy);
  });

  it('without SPC on the IPC hardness the drifting cases ship', () => {
    const r = broken((c) => { c.quality.inspectionPlans = c.quality.inspectionPlans.filter((p) => p.source !== 'inlineGauge'); });
    const h = r.quality.results.find((d) => d.defectCode === 'HARD-DEV');
    expect(h.detected).toBe(false);
    expect(h.shipped).toBeGreaterThan(0);
  });

  it('no containment means detected defects ship anyway', () => {
    const r = broken((c) => { c.quality.containment = []; });
    expect(r.kpis.defectsShipped).toBeGreaterThan(0);
  });
});

describe('the whole-config disaster (factory defaults)', () => {
  const r = broken((c) => {
    c.orders.validationChecks = { skuValid: false, uomIsCases: false, bomExists: false, uiRangeAssigned: false };
    c.apsIntegration.feasibilityChecks = { orderReleased: false, blendAvailable: false, siloRouting: false, changeoverRules: false, materialReadiness: false };
    c.apsIntegration.releaseGate.mode = 'autoAccept';
    c.apsIntegration.purgeEnforcement.enabled = false;
    c.apsIntegration.actualsFeedback = { enabled: false, fields: [], onDelayMin: 0 };
    c.connectivity.tagMap = [];
    c.connectivity.signalRules = { staleTimeoutSec: 0, flatline: { enabled: false, windowMin: 0 } };
    c.oee.stateWordMap = {};
    c.oee.calendar.breaks = [];
    c.quality.inspectionPlans = [];
    c.quality.containment = [];
    c.traceability.serialization = { uiPrintMachineClass: null, cameraVerify: false, voidOnFail: false };
    c.traceability.aggregation.levels = [];
    c.traceability.repository = { enabled: false, partnerId: null, bufferAndRetry: false };
  });

  it('produces far less than the model answer', () => {
    expect(r.kpis.producedCases).toBeLessThan(good.kpis.producedCases * 0.95);
    expect(r.kpis.scheduleAdherence).toBeLessThan(0.7);
  });

  it('ships defective product and sees almost nothing', () => {
    expect(r.kpis.defectsShipped).toBeGreaterThan(20);
    expect(r.kpis.dataFidelity).toBeLessThan(0.2);
    expect(r.kpis.oeeTrusted).toBe(false);
  });

  it('leaves the day legally unreported', () => {
    expect(r.kpis.repositoryReported).toBe(0);
    expect(r.kpis.apsFeedbackSent).toBe(0);
  });
});
