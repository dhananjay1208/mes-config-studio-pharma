// Pure operations over the flat plantModel node list. Every op returns a NEW
// array; callers dispatch it wholesale via setConfig(['plantModel','nodes']).
import { childrenOf } from './selectors.js';

const ID_PREFIX = { area: 'AREA', line: 'LINE', machine: 'MC', buffer: 'BUF', silo: 'SILO' };
const DEFAULT_NAME = { area: 'New Area', line: 'New Line', machine: 'New Machine', buffer: 'New coated-bulk hold', silo: 'New IBC' };
const DEFAULT_PROPS = {
  area: { areaClass: '' },
  line: { potentCapable: false },
  machine: { machineClass: '' },
  buffer: { machineClass: 'reservoir', bufferMin: 0 },
  silo: { blendCode: '', capacityKg: 0, startLevelKg: 0, feedsLineCodes: [] },
};

export function nextId(nodes, type) {
  const prefix = ID_PREFIX[type] ?? type.toUpperCase();
  let max = 0;
  for (const n of nodes) {
    const m = n.id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${max + 1}`;
}

/** Re-number seq 0..n within every sibling group (keeps ordering stable). */
export function normalizeSeq(nodes) {
  const parents = [...new Set(nodes.map((n) => n.parentId))];
  const out = nodes.map((n) => ({ ...n }));
  for (const pid of parents) {
    childrenOf(out, pid).forEach((child, i) => { child.seq = i; });
  }
  return out;
}

export function addChild(nodes, parentId, type, overrides = {}) {
  const id = overrides.id ?? nextId(nodes, type);
  const siblings = childrenOf(nodes, parentId);
  const node = {
    id,
    type,
    parentId,
    name: overrides.name ?? DEFAULT_NAME[type] ?? 'New Node',
    code: overrides.code ?? id,
    seq: overrides.seq ?? siblings.length,
    props: { ...DEFAULT_PROPS[type], ...(overrides.props ?? {}) },
  };
  return { nodes: normalizeSeq([...nodes, node]), id };
}

export function deleteCascade(nodes, id) {
  const doomed = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (n.parentId && doomed.has(n.parentId) && !doomed.has(n.id)) {
        doomed.add(n.id);
        grew = true;
      }
    }
  }
  return normalizeSeq(nodes.filter((n) => !doomed.has(n.id)));
}

export function moveSibling(nodes, id, dir) {
  const node = nodes.find((n) => n.id === id);
  if (!node) return nodes;
  const siblings = childrenOf(nodes, node.parentId);
  const idx = siblings.findIndex((s) => s.id === id);
  const swapWith = siblings[idx + dir];
  if (!swapWith) return nodes;
  return normalizeSeq(nodes.map((n) => {
    if (n.id === id) return { ...n, seq: swapWith.seq };
    if (n.id === swapWith.id) return { ...n, seq: node.seq };
    return n;
  }));
}

export function updateNode(nodes, id, patch) {
  return nodes.map((n) => (n.id === id ? { ...n, ...patch, props: { ...n.props, ...(patch.props ?? {}) } } : n));
}

/** Find an area by code under the site, or create it. */
function ensureArea(nodes, siteId, areaDef) {
  const existing = nodes.find((n) => n.type === 'area' && n.code === areaDef.code);
  if (existing) return { nodes, areaId: existing.id };
  const { nodes: withArea, id } = addChild(nodes, siteId, 'area', {
    name: areaDef.name, code: areaDef.code, props: { areaClass: areaDef.areaClass },
  });
  return { nodes: withArea, areaId: id };
}

/**
 * Insert a standard line (area if needed + line + machines) from a
 * LINE_TEMPLATES entry. Template machines with kind 'buffer' become the
 * coater + coated-bulk hold (the press→blister decoupling buffer).
 */
export function applyLineTemplate(nodes, siteId, template) {
  const ensured = ensureArea(nodes, siteId, template.area);
  let acc = ensured.nodes;
  const { nodes: withLine, id: lineId } = addChild(acc, ensured.areaId, 'line', {
    name: template.line.name, code: template.line.code,
    props: { potentCapable: Boolean(template.line.potentCapable) },
  });
  acc = withLine;
  for (const m of template.machines) {
    const type = m.kind === 'buffer' ? 'buffer' : 'machine';
    const props = { ...m };
    delete props.name; delete props.code; delete props.kind;
    acc = addChild(acc, lineId, type, { name: m.name, code: m.code, props }).nodes;
  }
  return acc;
}

/** Insert the IBC fleet (primaryFeed area if needed + silo/IBC nodes). */
export function applySiloTemplates(nodes, siteId, siloDefs, areaDef) {
  const ensured = ensureArea(nodes, siteId, areaDef);
  let acc = ensured.nodes;
  for (const s of siloDefs) {
    if (acc.some((n) => n.type === 'silo' && n.code === s.code)) continue;
    acc = addChild(acc, ensured.areaId, 'silo', {
      name: s.name, code: s.code,
      props: { blendCode: s.blendCode, capacityKg: s.capacityKg, startLevelKg: s.startLevelKg, feedsLineCodes: [...s.feedsLineCodes] },
    }).nodes;
  }
  return acc;
}
