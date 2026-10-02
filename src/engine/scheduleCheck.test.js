import { describe, it, expect } from 'vitest';
import { deriveScheduleBank, believedChangeoverMin, actualChangeoverMin } from './scheduleCheck.js';
import { buildModelAnswerConfig } from '../data/presets.js';
import { DEPLOY_DAY } from '../data/apsFeed.js';

const clone = (c) => JSON.parse(JSON.stringify(c));
const POISONED = ['RUN-909', 'RUN-910', 'RUN-911', 'RUN-912', 'RUN-914'];
const entryFor = (bank, runId) => bank.entries.find((e) => e.run.runId === runId);

describe('APS schedule validation', () => {
  const bank = deriveScheduleBank(buildModelAnswerConfig());

  it('releases exactly the six executable Wednesday runs', () => {
    const released = bank.entries.filter((e) => e.status === 'released');
    expect(released).toHaveLength(6);
    expect(released.every((e) => e.run.day === DEPLOY_DAY)).toBe(true);
    expect(bank.dayRuns.map((r) => r.runId).sort()).toEqual(
      ['RUN-301', 'RUN-302', 'RUN-303', 'RUN-390', 'RUN-501', 'RUN-502']
    );
  });

  it('blocks all five infeasible runs', () => {
    for (const id of POISONED) {
      expect(entryFor(bank, id).status, id).toBe('infeasible');
    }
  });

  it('each poisoned run is caught by the check that owns it', () => {
    const caughtBy = (id) => new Set(entryFor(bank, id).findings.map((f) => f.checkId));
    expect(caughtBy('RUN-909')).toContain('siloRouting');    // Zentrix on a non-segregated line
    expect(caughtBy('RUN-914')).toContain('siloRouting');    // Zentrix pulled onto L3 mid-Wednesday
    expect(caughtBy('RUN-910')).toContain('blendAvailable'); // empties the Cardexil 20 mg IBC
    expect(caughtBy('RUN-911')).toContain('orderReleased');  // order ERP never sent
    expect(caughtBy('RUN-912')).toContain('changeoverRules'); // 30 min gap for a 360 min validated clean
  });

  it('a potent product on a non-segregated line names the contamination consequence', () => {
    const msg = entryFor(bank, 'RUN-909').findings.map((f) => f.msg).join(' ');
    expect(msg).toMatch(/potent/i);
    expect(msg).toMatch(/contaminat/i);
  });

  it('with every check off, nothing is infeasible — the poison flows through', () => {
    const c = clone(buildModelAnswerConfig());
    c.apsIntegration.feasibilityChecks = {
      orderReleased: false, blendAvailable: false, siloRouting: false,
      changeoverRules: false, materialReadiness: false,
    };
    const b = deriveScheduleBank(c);
    expect(b.entries.some((e) => e.status === 'infeasible')).toBe(false);
    expect(b.dayRuns.length).toBeGreaterThan(6);
  });

  it('auto-accept computes findings and then ignores them', () => {
    const c = clone(buildModelAnswerConfig());
    c.apsIntegration.releaseGate.mode = 'autoAccept';
    const b = deriveScheduleBank(c);
    expect(entryFor(b, 'RUN-914').findings.length).toBeGreaterThan(0);
    expect(entryFor(b, 'RUN-914').status).toBe('released');
  });

  it('an unmapped interface yields no executable runs', () => {
    const c = clone(buildModelAnswerConfig());
    c.apsIntegration.interfaceMap = [];
    expect(deriveScheduleBank(c).dayRuns).toHaveLength(0);
  });

  it('the export rush call-off needs its serial pool — materialReadiness owns that trap', () => {
    const c = clone(buildModelAnswerConfig());
    c.materials.uiRanges = c.materials.uiRanges.filter((r) => r.market !== 'EXP');
    const b = deriveScheduleBank(c);
    const rush = entryFor(b, 'RUN-390');
    expect(rush.status).toBe('infeasible');
    expect(rush.findings.map((f) => f.checkId)).toContain('materialReadiness');
  });
});

// Pharma ladder (canon): 20 strength/market/batch · 120 product · 180 tooling · 360 potent clean.
// The family (API) decides rung 1 vs rung 2; blend codes differ per strength.
describe('changeover model: belief vs physics', () => {
  const sku = (over) => ({ code: 'X', family: 'CDX', format: 'T11', blendCode: 'BLND-CDX10', potent: false, ...over });
  const model = { sameBlendSameFormatMin: 20, blendChangeMin: 120, formatChangeMin: 180, potentCleanMin: 360 };

  it('a correct belief matches physics for every transition kind', () => {
    const pairs = [
      [sku(), sku()],
      [sku(), sku({ blendCode: 'BLND-CDX20' })],                              // strength change, same family
      [sku(), sku({ family: 'ZTX', blendCode: 'BLND-ZTX50', potent: true })], // product change
      [sku(), sku({ family: 'FEM', blendCode: 'BLND-FEM25', format: 'T4' })], // tooling change
      [sku({ family: 'ZTX', blendCode: 'BLND-ZTX50', potent: true }), sku()], // potent clean
    ];
    for (const [from, to] of pairs) {
      expect(believedChangeoverMin(model, from, to)).toBe(actualChangeoverMin(from, to));
    }
  });

  it('a strength change inside a family is the cheap line clearance, a family change is a product change', () => {
    expect(actualChangeoverMin(sku(), sku({ blendCode: 'BLND-CDX20' }))).toBe(20);
    expect(actualChangeoverMin(sku(), sku({ family: 'ZTX', blendCode: 'BLND-ZTX50', potent: true }))).toBe(120);
  });

  it('a blank belief makes every transition look free — physics does not agree', () => {
    const blank = { sameBlendSameFormatMin: 0, blendChangeMin: 0, formatChangeMin: 0, potentCleanMin: 0 };
    const from = sku({ family: 'ZTX', blendCode: 'BLND-ZTX50', potent: true });
    expect(believedChangeoverMin(blank, from, sku())).toBe(0);
    expect(actualChangeoverMin(from, sku())).toBe(360);
  });
});
