import { describe, it, expect } from 'vitest';
import { emptyConfig, createInitialState } from './defaults.js';
import { reducer } from './reducer.js';
import { setConfig, importState } from './actions.js';
import { addChild, deleteCascade, moveSibling, applyLineTemplate, applySiloTemplates } from './plantOps.js';
import { linesOfPlant, silosOf, silosFeedingLine, deriveFlow, areaByClass } from './selectors.js';
import { LINE_TEMPLATES, SILO_TEMPLATES } from '../data/customer.js';
import { buildModelAnswerConfig } from '../data/presets.js';

const PRIMARY_AREA = { name: 'Blend Supply (IBC fleet)', code: 'PRIM', areaClass: 'primaryFeed' };

describe('config schema & state', () => {
  it('empty config carries all eight module slices', () => {
    const c = emptyConfig();
    for (const slice of ['plantModel', 'materials', 'orders', 'apsIntegration', 'connectivity', 'traceability', 'oee', 'quality']) {
      expect(c[slice], slice).toBeDefined();
    }
  });

  it('starts with the enterprise and site scaffolding only', () => {
    const c = emptyConfig();
    expect(c.plantModel.nodes).toHaveLength(2);
    expect(c.plantModel.nodes.map((n) => n.type)).toEqual(['enterprise', 'site']);
  });

  it('CONFIG_SET deep-sets and bumps updatedAt', () => {
    const s0 = createInitialState('sandbox');
    const s1 = reducer(s0, setConfig(['oee', 'shortStopThresholdMin'], 3));
    expect(s1.config.oee.shortStopThresholdMin).toBe(3);
    expect(s1.meta.updatedAt).toBeGreaterThanOrEqual(s0.meta.updatedAt);
    expect(s0.config.oee.shortStopThresholdMin).toBe(0); // immutable
  });

  it('import round-trips a configuration', () => {
    const s0 = createInitialState('guided');
    const model = buildModelAnswerConfig();
    const s1 = reducer(s0, importState({ meta: s0.meta, config: model, project: s0.project }));
    expect(s1.config.materials.skus).toHaveLength(5);
    expect(JSON.parse(JSON.stringify(s1.config))).toEqual(JSON.parse(JSON.stringify(model)));
  });
});

describe('plant operations', () => {
  it('line template builds press → coater/hold → blister → cartoner', () => {
    let nodes = emptyConfig().plantModel.nodes;
    nodes = applyLineTemplate(nodes, 'SITE-HP2', LINE_TEMPLATES.line3);
    const lines = linesOfPlant({ plantModel: { nodes } });
    expect(lines).toHaveLength(1);
    expect(lines[0].maker.code).toBe('PR3');
    expect(lines[0].reservoir.code).toBe('CO1');
    expect(lines[0].reservoir.props.bufferMin).toBe(120);
    expect(lines[0].packer.code).toBe('BL3');
    expect(lines[0].cartoner.code).toBe('CR3');
  });

  it('IBC templates set the docking rules by blend (potent docks on L5 only)', () => {
    let nodes = emptyConfig().plantModel.nodes;
    nodes = applySiloTemplates(nodes, 'SITE-HP2', SILO_TEMPLATES, PRIMARY_AREA);
    const config = { plantModel: { nodes } };
    expect(silosOf(config)).toHaveLength(4);
    expect(silosFeedingLine(config, 'L5').map((s) => s.props.blendCode).sort()).toEqual(['BLND-CDX20', 'BLND-ZTX50']);
    expect(silosFeedingLine(config, 'L3').some((s) => s.props.blendCode === 'BLND-ZTX50')).toBe(false);
  });

  it('deleting a line cascades to its machines', () => {
    let nodes = applyLineTemplate(emptyConfig().plantModel.nodes, 'SITE-HP2', LINE_TEMPLATES.line3);
    const line = nodes.find((n) => n.type === 'line');
    nodes = deleteCascade(nodes, line.id);
    expect(nodes.filter((n) => n.type === 'machine' || n.type === 'buffer')).toHaveLength(0);
  });

  it('moveSibling reorders within the parent only', () => {
    let nodes = applyLineTemplate(emptyConfig().plantModel.nodes, 'SITE-HP2', LINE_TEMPLATES.line3);
    const line = nodes.find((n) => n.type === 'line');
    const before = nodes.filter((n) => n.parentId === line.id).sort((a, b) => a.seq - b.seq).map((n) => n.code);
    const second = nodes.find((n) => n.parentId === line.id && n.seq === 1);
    nodes = moveSibling(nodes, second.id, -1);
    const after = nodes.filter((n) => n.parentId === line.id).sort((a, b) => a.seq - b.seq).map((n) => n.code);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  });

  it('the model answer plant has two lines, four IBCs, the granulation suite and shared finishing', () => {
    const config = buildModelAnswerConfig();
    expect(linesOfPlant(config)).toHaveLength(2);
    expect(silosOf(config)).toHaveLength(4);
    expect(areaByClass(config, 'finishing')).toBeTruthy();
    expect(areaByClass(config, 'upstream')).toBeTruthy();
    expect(deriveFlow(config).length).toBeGreaterThanOrEqual(4);
  });

  it('addChild normalizes sequence numbers', () => {
    const { nodes, id } = addChild(emptyConfig().plantModel.nodes, 'SITE-HP2', 'area', { name: 'A', code: 'A' });
    expect(nodes.find((n) => n.id === id).seq).toBe(0);
  });
});
