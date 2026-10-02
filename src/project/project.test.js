import { describe, it, expect } from 'vitest';
import { PHASES, checkPhase, moduleUnlocked } from './phases.js';
import { totalStars, maxStars, gradeFor } from './scoring.js';
import { emptyConfig, createInitialState } from '../engine/defaults.js';
import { buildModelAnswerConfig } from '../data/presets.js';
import { MODULES } from '../modules/registry.js';

describe('guided project', () => {
  const model = buildModelAnswerConfig();

  it('has ten phases, each naming a real module or none', () => {
    expect(PHASES).toHaveLength(10);
    const ids = MODULES.map((m) => m.id);
    for (const p of PHASES) {
      if (p.moduleId) expect(ids, `phase ${p.id}`).toContain(p.moduleId);
    }
  });

  it('every configuration module is claimed by exactly one phase', () => {
    const claimed = PHASES.map((p) => p.moduleId).filter(Boolean);
    expect(new Set(claimed).size).toBe(MODULES.length);
  });

  it('the model answer earns three stars in every phase', () => {
    let stars = 0;
    for (const p of PHASES) {
      const r = checkPhase(model, p.id);
      const failed = r.checks.filter((c) => !c.ok).map((c) => c.label);
      expect(failed, `phase ${p.id} ${p.title}`).toEqual([]);
      stars += r.stars;
    }
    expect(stars).toBe(maxStars());
  });

  it('an empty configuration fails every phase that has acceptance', () => {
    for (const p of PHASES) {
      if (!p.accept) continue;
      expect(checkPhase(emptyConfig(), p.id).passed, `phase ${p.id}`).toBe(false);
    }
  });

  it('acceptance labels report the trainee\'s own numbers', () => {
    const labels = PHASES.flatMap((p) => checkPhase(model, p.id).checks.map((c) => c.label));
    expect(labels.some((l) => /yours:/.test(l))).toBe(true);
  });

  it('guided mode locks modules beyond the current phase', () => {
    const state = { ...createInitialState('guided'), project: { currentPhase: 3, phases: {}, signoffs: [] } };
    expect(moduleUnlocked(state, 3)).toBe(true);
    expect(moduleUnlocked(state, 4)).toBe(false);
    expect(moduleUnlocked({ ...state, ui: { instructorMode: true } }, 8)).toBe(true);
    expect(moduleUnlocked({ ...state, meta: { ...state.meta, mode: 'sandbox' } }, 8)).toBe(true);
  });

  it('a full model-answer playthrough grades A+', () => {
    const phases = {};
    for (const p of PHASES) phases[p.id] = { status: 'passed', stars: checkPhase(model, p.id).stars };
    const project = { currentPhase: 9, phases, signoffs: [] };
    expect(totalStars(project)).toBe(maxStars());
    expect(gradeFor(checkPhase(model, 9).checks, project)).toMatch(/^A/);
  });
});
