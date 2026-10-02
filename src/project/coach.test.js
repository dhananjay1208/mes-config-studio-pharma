import { describe, it, expect } from 'vitest';
import { COACH, coachSteps, coachProgress, p4MissedRunsHelp } from './coach.js';
import { PHASES, checkPhase } from './phases.js';
import { MODULES } from '../modules/registry.js';
import { emptyConfig, createInitialState } from '../engine/defaults.js';
import { buildModelAnswerConfig } from '../data/presets.js';
import { validateApsIntegration } from '../engine/validate.js';
import { reducer } from '../engine/reducer.js';
import { setConfig } from '../engine/actions.js';

// The canonical tab ids of each module's TABS strip — coach steps deep-link
// into these, so a renamed tab must fail loudly here.
const MODULE_TABS = {
  plantModel: ['tree', 'flow', 'feed'],
  materials: ['skus', 'materials', 'bom', 'ranges'],
  orders: ['interface', 'inbox', 'release'],
  apsIntegration: ['feed', 'checks', 'changeover', 'release'],
  connectivity: ['connections', 'tagmap', 'sampling', 'quality'],
  traceability: ['track', 'serial', 'agg', 'gene', 'repo'],
  oee: ['states', 'words', 'reasons', 'calendar'],
  quality: ['catalog', 'plans', 'containment'],
};

describe('coach layer', () => {
  const model = buildModelAnswerConfig();
  const configPhases = PHASES.filter((p) => p.moduleId).map((p) => p.id);

  it('covers every configuration phase with well-formed steps', () => {
    const allIds = new Set();
    for (const p of configPhases) {
      const def = COACH[p];
      expect(def, `phase ${p} has a coach script`).toBeTruthy();
      expect(def.moduleId).toBe(PHASES.find((x) => x.id === p).moduleId);
      expect(MODULES.some((m) => m.id === def.moduleId)).toBe(true);
      for (const s of def.steps) {
        expect(allIds.has(s.id), `duplicate step id ${s.id}`).toBe(false);
        allIds.add(s.id);
        expect(MODULE_TABS[def.moduleId], `step ${s.id} tab ${s.tab}`).toContain(s.tab);
        expect(typeof s.done).toBe('function');
        expect(typeof s.fix).toBe('function');
        expect(s.instruction.length).toBeGreaterThan(40);
      }
    }
  });

  it('marks every step done for the model answer', () => {
    for (const p of configPhases) {
      const prog = coachProgress(model, p);
      const open = prog.steps.filter((s) => !s.done).map((s) => s.id);
      expect(open, `phase ${p}`).toEqual([]);
    }
  });

  it('marks no phase complete for an empty configuration', () => {
    const empty = emptyConfig();
    for (const p of configPhases) {
      const prog = coachProgress(empty, p);
      expect(prog.doneCount, `phase ${p}`).toBeLessThan(prog.total);
    }
    expect(coachProgress(empty, 4).doneCount).toBe(0);
  });

  it('has no coach script for kickoff and go-live', () => {
    expect(coachProgress(emptyConfig(), 0)).toBeNull();
    expect(coachProgress(emptyConfig(), 9)).toBeNull();
    expect(coachSteps(0)).toEqual([]);
  });

  it('"Show me" fixes, applied through the real reducer, rebuild a passing deployment', () => {
    let state = createInitialState('guided');
    for (const p of configPhases) {
      for (const step of coachSteps(p)) {
        const live = coachProgress(state.config, p).steps.find((s) => s.id === step.id);
        if (live.done) continue;
        const fix = step.fix(state.config);
        if (!fix) continue;
        for (const op of fix.ops) state = reducer(state, setConfig(op.path, op.value));
      }
    }
    for (const p of configPhases) {
      const prog = coachProgress(state.config, p);
      const open = prog.steps.filter((s) => !s.done).map((s) => s.id);
      expect(open, `phase ${p} steps`).toEqual([]);
      expect(checkPhase(state.config, p).passed, `phase ${p} acceptance`).toBe(true);
    }
  });

  // Pharma edition: labels re-authored together with the phases (2026-09-26) —
  // "potent-product clean" replaces the donor purge rung, Cadence APS replaces the donor APS name.
  it('keeps the P4 acceptance labels byte-identical (hints are additive)', () => {
    const labels = (cfg) => checkPhase(cfg, 4).checks.map((c) => c.label);
    expect(labels(model)).toEqual([
      'All seven schedule fields mapped correctly',
      'All five feasibility checks enabled',
      'Release gate blocks infeasible runs',
      'All five infeasible runs blocked (yours: 5/5)',
      "Wednesday's six runs released (yours: 6)",
      'Potent-product clean dispatched to the night window',
      'Actuals feedback to Cadence APS configured',
    ]);
    expect(labels(emptyConfig())).toEqual([
      'All seven schedule fields mapped correctly',
      'All five feasibility checks enabled',
      'Release gate blocks infeasible runs',
      'All five infeasible runs blocked (yours: 0/5)',
      "Wednesday's six runs released (yours: 0)",
      'Potent-product clean dispatched to the night window',
      'Actuals feedback to Cadence APS configured',
    ]);
  });

  // Pharma: the printout says 360 (validated potent clean), not 240.
  it('diagnoses the potentCleanMin=0 trap as RUN-912 with the fix location', () => {
    const cfg = buildModelAnswerConfig();
    cfg.apsIntegration.changeoverModel = { ...cfg.apsIntegration.changeoverModel, potentCleanMin: 0 };
    const fail = checkPhase(cfg, 4).checks.find((c) => !c.ok);
    expect(fail.label).toBe('All five infeasible runs blocked (yours: 4/5)');
    expect(fail.help.hint).toMatch(/RUN-912/);
    expect(fail.help.hint).toMatch(/360/);
    expect(fail.help.hint).toMatch(/Changeover Rules/);
    expect(fail.help.moduleId).toBe('apsIntegration');
    expect(fail.help.tab).toBe('changeover');
  });

  it('diagnoses the unmapped END_TS path for RUN-912', () => {
    const cfg = buildModelAnswerConfig();
    cfg.apsIntegration.interfaceMap = cfg.apsIntegration.interfaceMap.filter((r) => r.mesField !== 'plannedEnd');
    const fail = checkPhase(cfg, 4).checks.find((c) => !c.ok && /infeasible runs blocked/.test(c.label));
    expect(fail.label).toBe('All five infeasible runs blocked (yours: 4/5)');
    expect(fail.help.hint).toMatch(/END_TS/);
  });

  it('p4MissedRunsHelp points at the gate when auto-accept swallows everything', () => {
    const cfg = buildModelAnswerConfig();
    cfg.apsIntegration.releaseGate = { mode: 'autoAccept' };
    const help = p4MissedRunsHelp(cfg);
    expect(help.hint).toMatch(/auto-accept/);
    expect(help.tab).toBe('release');
    expect(p4MissedRunsHelp(model)).toBeNull();
  });

  // Pharma ladder 20 / 120 / 180 / 360; the zero-valued rung is the potent clean.
  it('warns per changeover value once the check is on and only some values are set', () => {
    const cfg = emptyConfig();
    cfg.apsIntegration.feasibilityChecks = { ...cfg.apsIntegration.feasibilityChecks, changeoverRules: true };
    cfg.apsIntegration.changeoverModel = { sameBlendSameFormatMin: 20, blendChangeMin: 120, formatChangeMin: 180, potentCleanMin: 0 };
    const findings = validateApsIntegration(cfg);
    const f = findings.find((x) => x.id === 'aps-co-potentCleanMin');
    expect(f).toBeTruthy();
    expect(f.level).toBe('warn');
    expect(f.msg).toMatch(/potent-product clean/);

    const off = emptyConfig();
    off.apsIntegration.changeoverModel = { ...cfg.apsIntegration.changeoverModel };
    expect(validateApsIntegration(off).some((x) => x.id.startsWith('aps-co-') && x.id !== 'aps-co-zero')).toBe(false);
  });
});
