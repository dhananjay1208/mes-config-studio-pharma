import { describe, it, expect } from 'vitest';
import { emptyConfig } from './defaults.js';
import {
  validateConfig, findingCounts, validatePlantModel, validateMaterials,
  validateApsIntegration, validateConnectivity, validateTraceability, validateOee, validateQuality,
} from './validate.js';
import { buildModelAnswerConfig } from '../data/presets.js';

const clone = (c) => JSON.parse(JSON.stringify(c));

describe('validators', () => {
  it('the model answer is completely clean', () => {
    const findings = validateConfig(buildModelAnswerConfig());
    expect(findings.map((f) => `${f.moduleId}: ${f.msg}`)).toEqual([]);
  });

  it('an empty configuration is loud in every module', () => {
    const findings = validateConfig(emptyConfig());
    const counts = findingCounts(findings);
    expect(counts.errors).toBeGreaterThan(5);
    expect(new Set(findings.map((f) => f.moduleId)).size).toBeGreaterThanOrEqual(6);
  });

  it('every finding message reads as a consequence, not a rule', () => {
    const findings = validateConfig(emptyConfig());
    for (const f of findings) {
      expect(f.msg.length, f.id).toBeGreaterThan(40);
      expect(f.msg, f.id).toMatch(/—|-/);
    }
  });

  it('a coated-bulk hold with no decoupling minutes is flagged', () => {
    const c = clone(buildModelAnswerConfig());
    const res = c.plantModel.nodes.find((n) => n.type === 'buffer');
    res.props.bufferMin = 0;
    expect(validatePlantModel(c).some((f) => f.id.includes('res0'))).toBe(true);
  });

  it('an export SKU without an EXP serial pool is an ERROR, not a warning', () => {
    const c = clone(buildModelAnswerConfig());
    c.materials.uiRanges = c.materials.uiRanges.filter((r) => r.market !== 'EXP');
    const f = validateMaterials(c).find((x) => x.id === 'mt-exp-range');
    expect(f).toBeTruthy();
    expect(f.level).toBe('error');
  });

  it('clean enforcement off is flagged with its contamination consequence', () => {
    const c = clone(buildModelAnswerConfig());
    c.apsIntegration.purgeEnforcement.enabled = false;
    const f = validateApsIntegration(c).find((x) => x.id === 'aps-purge-off');
    expect(f.msg).toMatch(/contaminated/i);
  });

  // Pharma trap: PR3's legacy TabCountK register counts kilo-tablets (×1,000).
  it('a wrongly scaled counter is flagged with the resulting factor', () => {
    const c = clone(buildModelAnswerConfig());
    const tag = c.connectivity.tagMap.find((t) => t.signal === 'prodCount' && t.nodeId.includes('PR3'));
    tag.nodeId = 'ns=2;s=PR3.Prod.TabCountK';
    const f = validateConnectivity(c).find((x) => x.id.startsWith('cn-scale-PR3'));
    expect(f).toBeTruthy();
    expect(f.msg).toMatch(/×/);
  });

  // Pharma trap: WeightTmg is tenths of a milligram (unitScale 0.1) — read as mg it is ×10.
  it('the tenth-of-a-milligram weight register is a ×10 scale trap', () => {
    const c = clone(buildModelAnswerConfig());
    const tag = c.connectivity.tagMap.find((t) => t.signal === 'tabletWeightMg' && t.nodeId.includes('PR3'));
    tag.nodeId = 'ns=2;s=PR3.Gauge.WeightTmg';
    const f = validateConnectivity(c).find((x) => x.id === 'cn-scale-PR3-tabletWeightMg');
    expect(f).toBeTruthy();
    expect(f.msg).toMatch(/×10/);
  });

  it('a nodeId outside the device catalog is an error', () => {
    const c = clone(buildModelAnswerConfig());
    c.connectivity.tagMap.find((t) => t.machineId && t.signal === 'stateWord').nodeId = 'ns=2;s=NOPE';
    expect(validateConnectivity(c).some((f) => f.id.startsWith('cn-node-') && f.level === 'error')).toBe(true);
  });

  it('slow sampling on a state word is flagged against the foil-splice micro-stops', () => {
    const c = clone(buildModelAnswerConfig());
    for (const t of c.connectivity.tagMap) if (t.signal === 'stateWord') t.pollMs = 30000;
    expect(validateConnectivity(c).some((f) => f.id.startsWith('cn-poll-') && /micro-stop/.test(f.msg))).toBe(true);
  });

  // Pharma identity law: the UI is printed at the cartoner's serialization station, never at the blister.
  it('printing the UI anywhere but the serialization station is an identity error', () => {
    const c = clone(buildModelAnswerConfig());
    c.traceability.serialization.uiPrintMachineClass = 'packer';
    const f = validateTraceability(c).find((x) => x.id === 'tr-ui-place');
    expect(f.level).toBe('error');
    expect(f.msg).toMatch(/CARTON/);
  });

  it('an empty state-word map warns per machine class', () => {
    const c = clone(buildModelAnswerConfig());
    c.oee.stateWordMap = {};
    const f = validateOee(c);
    expect(f.some((x) => x.id === 'oe-words-maker')).toBe(true);
    expect(f.some((x) => x.id === 'oe-words-packer')).toBe(true);
  });

  it('an inspection plan reading an unmapped tag is flagged across modules', () => {
    const c = clone(buildModelAnswerConfig());
    c.connectivity.tagMap = c.connectivity.tagMap.filter((t) => t.signal !== 'caseWeightKg');
    expect(validateQuality(c).some((f) => f.id.startsWith('ql-tag-'))).toBe(true);
  });
});
