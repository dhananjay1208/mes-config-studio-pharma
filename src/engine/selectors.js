// Derivations over the plantConfig. Everything the UI needs from the model is
// computed here — the config itself stays a plain, exportable document.

// ---------------------------------------------------------------------------
// Identity lifecycle (engine law, asserted in tests):
// an ORDER lives in the order bank → becomes a RUN (a batch) when an accepted
// APS run starts on a line → cartons receive their UI ONLY at the cartoner's
// serialization station (print & verify) → aggregation is strictly
// carton → bundle (×10) → case (×20 bundles) → pallet SSCC.
// Never show a UI for anything that has not passed the serialization station.
// ---------------------------------------------------------------------------
export function runLabel(run) {
  if (!run) return '—';
  if (run.started && run.runId) return run.runId;
  return run.orderNo ?? '—';
}

// ---------------------------------------------------------------------------
// Plant model tree helpers
// ---------------------------------------------------------------------------
export function nodeById(nodes, id) {
  return nodes.find((n) => n.id === id) ?? null;
}

export function childrenOf(nodes, parentId) {
  return nodes.filter((n) => n.parentId === parentId).sort((a, b) => a.seq - b.seq);
}

export function nodePath(nodes, id) {
  const path = [];
  let cur = nodeById(nodes, id);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? nodeById(nodes, cur.parentId) : null;
  }
  return path;
}

/** Machines (incl. the reservoir buffer) of one line, in flow order. */
export function machinesOfLine(nodes, lineId) {
  return childrenOf(nodes, lineId).filter((n) => n.type === 'machine' || n.type === 'buffer');
}

export function machineOfLineByClass(nodes, lineId, machineClass) {
  return machinesOfLine(nodes, lineId).find((m) => m.props.machineClass === machineClass) ?? null;
}

/** The coater + coated-bulk hold of a line (the buffer node inside the line). */
export function reservoirOfLine(nodes, lineId) {
  return machinesOfLine(nodes, lineId).find((m) => m.type === 'buffer') ?? null;
}

/** All machines in flow order for a given area. */
export function machinesOfArea(nodes, areaId) {
  const out = [];
  for (const line of childrenOf(nodes, areaId).filter((n) => n.type === 'line')) {
    for (const m of machinesOfLine(nodes, line.id)) out.push(m);
  }
  // IBCs (silo nodes) live directly under the primaryFeed area.
  for (const silo of childrenOf(nodes, areaId).filter((n) => n.type === 'silo')) out.push(silo);
  return out;
}

/**
 * Derive the production flow from the model: site children ordered by seq.
 * Returns [{ kind:'shop', area, stations }] in flow order — `stations` keeps
 * the automotive name so FlowStrip renders unchanged.
 */
export function deriveFlow(config) {
  const nodes = config.plantModel.nodes;
  const site = nodes.find((n) => n.type === 'site');
  if (!site) return [];
  const flow = [];
  for (const child of childrenOf(nodes, site.id)) {
    if (child.type === 'area') {
      flow.push({ kind: 'shop', area: child, stations: machinesOfArea(nodes, child.id) });
    } else if (child.type === 'buffer') {
      flow.push({ kind: 'buffer', node: child });
    }
  }
  return flow;
}

/** First area of a given areaClass, or null. */
export function areaByClass(config, areaClass) {
  return config.plantModel.nodes.find((n) => n.type === 'area' && n.props.areaClass === areaClass) ?? null;
}

/**
 * The compression/packaging lines in flow order — the lines the run engine walks.
 * Returns [{ line, maker (press), reservoir (coater+hold), packer (blister), cartoner, machines }];
 * lineIndex (the reality tape's binding) is the position in this array.
 */
export function linesOfPlant(config) {
  const nodes = config.plantModel.nodes;
  const secondary = areaByClass(config, 'secondary');
  if (!secondary) return [];
  return childrenOf(nodes, secondary.id)
    .filter((n) => n.type === 'line')
    .map((line) => ({
      line,
      maker: machineOfLineByClass(nodes, line.id, 'maker'),
      reservoir: reservoirOfLine(nodes, line.id),
      packer: machineOfLineByClass(nodes, line.id, 'packer'),
      cartoner: machineOfLineByClass(nodes, line.id, 'cartoner'),
      machines: machinesOfLine(nodes, line.id),
    }));
}

/** All IBC (silo) nodes — the blend-supply constraint feed. */
export function silosOf(config) {
  return config.plantModel.nodes.filter((n) => n.type === 'silo');
}

/** IBCs that may dock on a given line code. */
export function silosFeedingLine(config, lineCode) {
  return silosOf(config).filter((s) => (s.props.feedsLineCodes || []).includes(lineCode));
}

/** Shared finishing machines by class (casePacker / palletizer). */
export function finishingMachineByClass(config, machineClass) {
  const fin = areaByClass(config, 'finishing');
  if (!fin) return null;
  return machinesOfArea(config.plantModel.nodes, fin.id).find((m) => m.props.machineClass === machineClass) ?? null;
}

/** Every machine that can hold a connection/tags (incl. the holds and the granulation suite). */
export function connectableMachines(config) {
  return config.plantModel.nodes.filter(
    (n) => n.type === 'machine' || (n.type === 'buffer' && n.props.machineClass === 'reservoir')
  );
}

/** All machines across the plant in flow order (for pickers). */
export function allMachinesInFlow(config) {
  return deriveFlow(config).flatMap((step) => (step.kind === 'shop' ? step.stations : []));
}
