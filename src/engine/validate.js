// Configuration validation — the platform's "check config" engine.
// error = the plant cannot run at all (blocks deploy).
// warn  = it runs, but the consequence will be visible in the results.
// Every finding: { id, level: 'error'|'warn', moduleId, msg }
// Every msg is written as a CONSEQUENCE sentence, not a rule statement.
import { PRODUCT_SPEC, SIGNAL_DICTIONARY, DEVICE_CATALOG } from '../data/customer.js';
import { PHYSICS } from '../data/realityTape.js';
import { linesOfPlant, silosOf, silosFeedingLine, areaByClass, finishingMachineByClass, connectableMachines } from './selectors.js';
import { MES_FIELDS } from '../data/erpFeed.js';
import { MES_SCHEDULE_FIELDS } from '../data/apsFeed.js';

const F = (id, level, moduleId, msg) => ({ id, level, moduleId, msg });

// Counters and state words polled slower than this cannot see a 6–9 s foil
// splice (a stop needs ~2 samples inside it to be seen).
export const MAX_FAST_POLL_MS = 3000;

// ---------------------------------------------------------------------------
export function validatePlantModel(config) {
  const out = [];
  const lines = linesOfPlant(config);

  if (lines.length === 0) {
    out.push(F('pm-no-lines', 'error', 'plantModel', 'No compression/packaging lines modeled — there is nothing to run the schedule on.'));
    return out;
  }
  if (lines.length < 2) {
    out.push(F('pm-one-line', 'warn', 'plantModel', 'Only one line modeled — Cadence APS schedules two (L3 and L5); half the schedule will have nowhere to run.'));
  }

  for (const L of lines) {
    if (!L.maker) out.push(F(`pm-${L.line.code}-maker`, 'error', 'plantModel', `${L.line.code} has no tablet press — no tablets can be compressed on this line.`));
    if (!L.packer) out.push(F(`pm-${L.line.code}-packer`, 'error', 'plantModel', `${L.line.code} has no blister machine — tablets can be pressed but never packed; the line is not routable.`));
    if (!L.cartoner) out.push(F(`pm-${L.line.code}-cartoner`, 'warn', 'plantModel', `${L.line.code} has no cartoner / serialization station — blisters pile up with nowhere to get a carton identity.`));
    if (!L.reservoir) {
      out.push(F(`pm-${L.line.code}-res`, 'warn', 'plantModel', `${L.line.code} has no coater / coated-bulk hold between press and blister — the MES believes every blister micro-stop stops the press instantly.`));
    } else if (!((L.reservoir.props.bufferMin ?? 0) > 0)) {
      out.push(F(`pm-${L.line.code}-res0`, 'warn', 'plantModel', `${L.line.code}'s coated-bulk hold has zero minutes of decoupling — it exists on the drawing but absorbs nothing, and the model couples press and blister like one machine.`));
    }
    if (L.maker && !(L.maker.props.ratedTabletsMin > 0)) out.push(F(`pm-${L.line.code}-mkspeed`, 'error', 'plantModel', `${L.maker.code} has no rated speed — the engine cannot compute a case rate.`));
    if (L.packer && !(L.packer.props.ratedBlistersMin > 0)) out.push(F(`pm-${L.line.code}-pkspeed`, 'error', 'plantModel', `${L.packer.code} has no rated speed — the engine cannot compute a case rate.`));
  }

  const silos = silosOf(config);
  if (silos.length === 0) {
    out.push(F('pm-no-silos', 'error', 'plantModel', 'No IBCs modeled — the presses have no blend supply; every run starves at 06:00.'));
  } else {
    for (const L of lines) {
      if (silosFeedingLine(config, L.line.code).length === 0) {
        out.push(F(`pm-${L.line.code}-nofeed`, 'warn', 'plantModel', `No IBC may dock on ${L.line.code} — any run scheduled there will starve immediately.`));
      }
    }
    for (const s of silos) {
      if (!s.props.blendCode) out.push(F(`pm-${s.code}-blend`, 'warn', 'plantModel', `${s.code} has no blend assigned — feasibility checks cannot see what it holds.`));
      if (!(s.props.startLevelKg > 0)) out.push(F(`pm-${s.code}-level`, 'warn', 'plantModel', `${s.code} has no released quantity — it reads empty to the blend-availability check.`));
    }
    const potentLines = lines.filter((L) => L.line.props.potentCapable);
    const potentSilo = silos.find((s) => (PRODUCT_SPEC.blends.find((b) => b.code === s.props.blendCode) ?? {}).potent);
    if (potentSilo && potentLines.length === 0) {
      out.push(F('pm-no-potent-line', 'warn', 'plantModel', 'A potent (Zentrix) IBC exists but no line is flagged potent-segregated — Zentrix 50 mg has nowhere legal to run.'));
    }
  }

  if (!finishingMachineByClass(config, 'casePacker')) out.push(F('pm-no-casepk', 'warn', 'plantModel', 'No case packer modeled — bundles cannot become cases; nothing can be palletized or sent to quarantine.'));
  if (!finishingMachineByClass(config, 'palletizer')) out.push(F('pm-no-palletizer', 'warn', 'plantModel', 'No palletizer modeled — no pallet SSCCs, so the EPCIS shipping events will have no container.'));
  if (!areaByClass(config, 'upstream')) out.push(F('pm-no-upstream', 'warn', 'plantModel', 'No granulation suite modeled — FBD2, the dryer whose NIR probe feeds the IBCs, does not exist to the MES; the batch side of the genealogy is dark.'));

  return out;
}

// ---------------------------------------------------------------------------
export function validateMaterials(config) {
  const out = [];
  const m = config.materials;

  if (m.skus.length === 0) {
    out.push(F('mt-no-skus', 'error', 'materials', 'No SKUs configured — no order can be validated, no run can be packed.'));
    return out;
  }
  for (const spec of PRODUCT_SPEC.skus) {
    if (!m.skus.some((s) => s.code === spec.code)) {
      out.push(F(`mt-miss-${spec.code}`, 'warn', 'materials', `The customer sells ${spec.name} (${spec.code}) but it is not configured — its orders and schedule runs will be rejected.`));
    }
  }
  for (const sku of m.skus) {
    const bom = m.boms.find((b) => b.skuCode === sku.code);
    if (!bom || bom.lines.length === 0) {
      out.push(F(`mt-bom-${sku.code}`, 'warn', 'materials', `${sku.code} has no BOM — the packaging line would have no film, foil, cartons or leaflets to consume, and genealogy has nothing to record.`));
      continue;
    }
    if (bom.lines.some((l) => !l.consumedAtMachineClass)) {
      out.push(F(`mt-bomat-${sku.code}`, 'warn', 'materials', `${sku.code}'s BOM has lines with no consuming machine — lot capture cannot know where to scan them.`));
    }
    const cf = bom.lines.some((l) => (m.items.find((i) => i.id === l.materialId)?.type === 'blend'));
    if (!cf) out.push(F(`mt-cf-${sku.code}`, 'warn', 'materials', `${sku.code}'s BOM has no final blend — the genealogy chain snaps at the batch/discrete boundary (IBC → press).`));
    if (sku.market === 'EXP') {
      const expVignette = bom.lines.some((l) => {
        const it = m.items.find((i) => i.id === l.materialId);
        return it?.type === 'vignette' && it.market === 'EXP';
      });
      const expCarton = bom.lines.some((l) => {
        const it = m.items.find((i) => i.id === l.materialId);
        return it?.type === 'carton' && it.market === 'EXP';
      });
      if (!expVignette || !expCarton) {
        out.push(F(`mt-exp-${sku.code}`, 'warn', 'materials', `${sku.code} is an export SKU but its BOM lacks the export ${!expCarton ? 'carton (Italian artwork)' : 'reimbursement vignette'} — the cartoner would dress export cartons as domestic.`));
      }
    }
  }

  const expSkus = m.skus.filter((s) => s.market === 'EXP');
  if (expSkus.length > 0) {
    const unranged = expSkus.filter((s) => !m.uiRanges.some((r) => r.market === 'EXP' && (r.assignedSkus || []).includes(s.code)));
    if (unranged.length > 0) {
      out.push(F('mt-exp-range', 'error', 'materials', `No EXP serial-number pool assigned to ${unranged.map((s) => s.code).join(', ')} — export cartons cannot be serialized; producing them would be a regulatory incident.`));
    }
  }
  const domSkus = m.skus.filter((s) => s.market === 'DOM');
  const domUnranged = domSkus.filter((s) => !m.uiRanges.some((r) => r.market === 'DOM' && (r.assignedSkus || []).includes(s.code)));
  if (domSkus.length > 0 && domUnranged.length > 0) {
    out.push(F('mt-dom-range', 'warn', 'materials', `${domUnranged.length} domestic SKU(s) have no serial-number pool — their cartons leave the cartoner without a legal identity.`));
  }

  return out;
}

// ---------------------------------------------------------------------------
export function validateOrders(config) {
  const out = [];
  const map = config.orders.interfaceMap ?? [];
  const mapped = new Set(map.map((r) => r.mesField).filter(Boolean));

  for (const f of ['orderNo', 'skuCode', 'qtyCases']) {
    if (!mapped.has(f)) out.push(F(`or-map-${f}`, 'error', 'orders', `ERP field for "${f}" is not mapped — every inbound order arrives with a hole where its ${f === 'orderNo' ? 'identity' : f === 'skuCode' ? 'product' : 'quantity'} should be.`));
  }
  for (const f of MES_FIELDS.map((x) => x.field)) {
    if (!['orderNo', 'skuCode', 'qtyCases'].includes(f) && !mapped.has(f)) {
      out.push(F(`or-map-${f}`, 'warn', 'orders', `"${f}" is not mapped — the order bank will show blanks and downstream checks lose a signal.`));
    }
  }
  const checks = config.orders.validationChecks;
  if (!checks.skuValid && !checks.uomIsCases && !checks.bomExists && !checks.uiRangeAssigned) {
    out.push(F('or-checks-off', 'warn', 'orders', 'All inbound validation checks are OFF — poisoned IDocs (unknown SKUs, tablet-denominated quantities) flow straight into the bank.'));
  }
  if (config.orders.releaseRule.mode === 'horizon' && !(config.orders.releaseRule.horizonOrders > 0)) {
    out.push(F('or-horizon0', 'warn', 'orders', 'Release horizon is zero — nothing is ever released, and every APS run will reference an unreleased order.'));
  }
  return out;
}

// ---------------------------------------------------------------------------
export function validateApsIntegration(config) {
  const out = [];
  const a = config.apsIntegration;
  const mapped = new Set((a.interfaceMap ?? []).map((r) => r.mesField).filter(Boolean));

  for (const f of ['runId', 'orderNo', 'lineCode', 'plannedStart']) {
    if (!mapped.has(f)) out.push(F(`aps-map-${f}`, 'error', 'apsIntegration', `APS field for "${f}" is not mapped — schedule messages cannot become executable runs.`));
  }
  for (const f of MES_SCHEDULE_FIELDS.map((x) => x.field)) {
    if (!['runId', 'orderNo', 'lineCode', 'plannedStart'].includes(f) && !mapped.has(f)) {
      out.push(F(`aps-map-${f}`, 'warn', 'apsIntegration', `"${f}" is not mapped — the schedule bank loses ${f === 'qtyCases' ? 'quantities' : f === 'plannedEnd' ? 'planned ends (adherence has no yardstick)' : 'a field it reports on'}.`));
    }
  }

  const checks = a.feasibilityChecks ?? {};
  const onCount = Object.values(checks).filter(Boolean).length;
  if (onCount === 0) {
    out.push(F('aps-checks-off', 'warn', 'apsIntegration', 'All feasibility checks are OFF — the MES will release whatever Cadence APS sends, including runs the plant physically cannot execute.'));
  }
  const cm = a.changeoverModel ?? {};
  if (!(cm.sameBlendSameFormatMin > 0) && !(cm.blendChangeMin > 0) && !(cm.formatChangeMin > 0) && !(cm.potentCleanMin > 0)) {
    out.push(F('aps-co-zero', 'warn', 'apsIntegration', 'Changeover rules are blank — the schedule validator believes every transition is free; infeasible gaps sail through.'));
  } else if (checks.changeoverRules) {
    // The sharpest silent trap: three values set, one left at zero — the check
    // is on but believes that ONE transition is free, and no run trips it.
    const rows = [
      ['sameBlendSameFormatMin', 'a strength / market / batch change'],
      ['blendChangeMin', 'a product change'],
      ['formatChangeMin', 'a format (tooling) change'],
      ['potentCleanMin', 'the potent-product clean'],
    ];
    for (const [key, what] of rows) {
      if (!(cm[key] > 0)) {
        out.push(F(`aps-co-${key}`, 'warn', 'apsIntegration',
          key === 'potentCleanMin'
            ? 'The changeover check is ON but the potent-product clean costs 0 minutes in your model — RUN-912, planned 30 minutes after a Zentrix run, will never be flagged.'
            : `The changeover check is ON but ${what} costs 0 minutes in your model — a run planned too close after its predecessor will never be flagged.`));
      }
    }
  }
  if (!a.purgeEnforcement?.enabled) {
    out.push(F('aps-purge-off', 'warn', 'apsIntegration', 'Potent-clean enforcement is OFF — after a Zentrix 50 mg run the next product starts on a contaminated line, with no swab and no QA release on record.'));
  }
  if (a.releaseGate?.mode !== 'blockOnError' && onCount > 0) {
    out.push(F('aps-gate-auto', 'warn', 'apsIntegration', 'Release gate is auto-accept — feasibility findings are computed and then ignored; infeasible runs execute anyway.'));
  }
  if (!a.actualsFeedback?.enabled) {
    out.push(F('aps-fb-off', 'warn', 'apsIntegration', "Actuals feedback to APS is disabled — tomorrow's schedule will be built on yesterday's fiction."));
  } else if ((a.actualsFeedback.fields ?? []).length === 0) {
    out.push(F('aps-fb-empty', 'warn', 'apsIntegration', 'Actuals feedback is on but sends no fields — Cadence APS receives empty envelopes.'));
  }
  return out;
}

// ---------------------------------------------------------------------------
export function validateConnectivity(config) {
  const out = [];
  const machines = connectableMachines(config);
  if (machines.length === 0) return out;

  const conns = config.connectivity.connections ?? [];
  const tags = config.connectivity.tagMap ?? [];

  for (const m of machines) {
    const cls = m.props.machineClass;
    const dict = SIGNAL_DICTIONARY[cls] ?? [];
    const connected = conns.some((c) => c.machineId === m.id && c.enabled !== false);
    if (!connected) {
      out.push(F(`cn-conn-${m.code}`, 'error', 'connectivity', `${m.code} has no connection — every one of its signals is dark; the machine does not exist to the MES.`));
      continue;
    }
    const catalog = DEVICE_CATALOG[m.code];
    if (!catalog) {
      out.push(F(`cn-cat-${m.code}`, 'warn', 'connectivity', `${m.code} is not in the plant device catalog — check the machine code against the controller inventory.`));
      continue;
    }
    for (const req of dict) {
      const tag = tags.find((t) => t.machineId === m.id && t.signal === req.signal);
      if (!tag) {
        const consequence =
          req.signal === 'stateWord' ? 'every stop becomes "unclassified" downtime'
          : req.signal.startsWith('rej') ? 'every rejected tablet/blister/carton is invisible — OEE Quality reads 100% while product is blown into the reject bin'
          : req.signal === 'prodCount' ? 'the MES cannot count what this machine produced'
          : req.signal === 'lodPct' ? 'a moisture (LOD) excursion in the dryer will pass unseen'
          : req.signal === 'bufferLevel' ? 'blocked/starved diagnosis loses its one explanatory signal'
          : req.signal === 'caseWeightKg' ? 'the checkweigher inspection plan will inspect nothing'
          : req.signal === 'tabletWeightMg' || req.signal === 'hardnessN' ? 'the SPC plan on that IPC characteristic inspects nothing'
          : req.signal === 'dispWeightKg' ? 'dispensing weights never reach the batch record — every scale print becomes a paper transcription'
          : 'a required signal is dark';
        out.push(F(`cn-tag-${m.code}-${req.signal}`, 'warn', 'connectivity', `${m.code}: "${req.label}" is not mapped — ${consequence}.`));
        continue;
      }
      const node = catalog.nodes.find((n) => n.nodeId === tag.nodeId);
      if (!node) {
        out.push(F(`cn-node-${m.code}-${req.signal}`, 'error', 'connectivity', `${m.code}: ${req.label} is bound to "${tag.nodeId}", which does not exist in the device address space — the subscription will never deliver a value.`));
        continue;
      }
      if (node.signal !== req.signal) {
        out.push(F(`cn-cross-${m.code}-${req.signal}`, 'warn', 'connectivity', `${m.code}: ${req.label} is bound to ${node.nodeId} ("${node.desc}") — the MES will faithfully record the wrong number.`));
      } else if (Math.abs((tag.scale ?? 1) / node.unitScale - 1) > 1e-9) {
        out.push(F(`cn-scale-${m.code}-${req.signal}`, 'warn', 'connectivity', `${m.code}: ${req.label} scale is ${tag.scale ?? 1} but ${node.nodeId} needs ×${node.unitScale} — recorded values will be ×${Math.round(((tag.scale ?? 1) / node.unitScale) * 1000) / 1000} of reality.`));
      }
      if ((req.kind === 'counter' || req.kind === 'state') && (tag.pollMs ?? 1000) > MAX_FAST_POLL_MS) {
        out.push(F(`cn-poll-${m.code}-${req.signal}`, 'warn', 'connectivity', `${m.code}: ${req.label} sampled every ${Math.round((tag.pollMs ?? 0) / 1000)}s — 6–9 s foil-splice micro-stops need two samples inside them and will never be seen as stops.`));
      }
    }
  }

  const rules = config.connectivity.signalRules ?? {};
  if (!rules.flatline?.enabled) {
    out.push(F('cn-flatline', 'warn', 'connectivity', `No flatline detection on analog signals — a frozen NIR probe on the dryer will feed the control room a comfortable ${PHYSICS.lodWindow.lo + 0.6} % all morning while a wet sub-lot heads for the press.`));
  }
  if (!(rules.staleTimeoutSec > 0)) {
    out.push(F('cn-stale', 'warn', 'connectivity', 'No stale-data timeout — when a controller drops offline, its last state word ("running") is trusted forever.'));
  }
  return out;
}

// ---------------------------------------------------------------------------
export function validateTraceability(config) {
  const out = [];
  const t = config.traceability;
  const lines = linesOfPlant(config);

  if (!t.serialization.uiPrintMachineClass) {
    out.push(F('tr-ui-none', 'error', 'traceability', 'UI printing is not configured anywhere — every carton leaves the plant legally anonymous.'));
  } else if (t.serialization.uiPrintMachineClass !== PHYSICS.uiPrintMachineClass) {
    out.push(F('tr-ui-place', 'error', 'traceability', `UI printing is configured at the ${t.serialization.uiPrintMachineClass} — a UI belongs to a CARTON and is printed & verified at the cartoner's serialization station only.`));
  } else {
    if (!t.serialization.cameraVerify) {
      out.push(F('tr-ui-verify', 'warn', 'traceability', 'UIs are printed but not camera-verified — unreadable DataMatrix codes ship, and the EU Hub rejects the shipping events.'));
    } else if (!t.serialization.voidOnFail) {
      out.push(F('tr-ui-void', 'warn', 'traceability', 'Camera verify is on but failed cartons are not voided — bad prints are detected and then shipped anyway.'));
    }
  }

  const levels = t.aggregation?.levels ?? [];
  const has = (lv) => levels.some((l) => l.level === lv);
  if (!has('carton')) out.push(F('tr-agg-carton', 'warn', 'traceability', 'No bundle-level aggregation scan — 200 loose carton UIs per case with no parent; recalls mean opening boxes.'));
  if (!has('case')) out.push(F('tr-agg-case', 'warn', 'traceability', 'No case-level aggregation scan — the EPCIS chain of custody has a hole 200 cartons wide.'));
  if (!has('pallet')) out.push(F('tr-agg-pallet', 'warn', 'traceability', 'No pallet SSCC — shipping events cannot name their container; the quarantine warehouse scans nothing.'));

  if (!t.genealogy?.blendLotCapture) {
    out.push(F('tr-cf', 'warn', 'traceability', 'The blend lot (IBC) is not captured at the press — the genealogy chain snaps exactly at the batch/discrete boundary.'));
  }
  const trackPoints = t.trackPoints ?? [];
  if (trackPoints.length === 0) {
    out.push(F('tr-tp', 'warn', 'traceability', 'No track points configured — runs start and finish without a single recorded event.'));
  } else {
    for (const L of lines) {
      if (L.maker && !trackPoints.some((tp) => tp.machineId === L.maker.id)) {
        out.push(F(`tr-tp-${L.line.code}`, 'warn', 'traceability', `${L.line.code}'s press has no track point — the IBC docking there has no event to hang its lot on.`));
      }
    }
  }

  if (!t.repository?.enabled) {
    out.push(F('tr-repo', 'warn', 'traceability', 'EU Hub upload is OFF — serials that never reach the Hub cannot be verified at the pharmacy; the batch cannot be released.'));
  } else if (!t.repository.bufferAndRetry) {
    out.push(F('tr-repo-buffer', 'warn', 'traceability', 'Hub upload has no buffer-and-retry — the first network wobble silently drops serial uploads.'));
  }
  return out;
}

// ---------------------------------------------------------------------------
export function validateOee(config) {
  const out = [];
  const o = config.oee;

  if ((o.stateModel ?? []).length === 0) {
    out.push(F('oe-states', 'error', 'oee', 'No equipment state model — the OEE engine has no buckets to classify a single minute into.'));
  }
  const wordMap = o.stateWordMap ?? {};
  for (const cls of ['maker', 'packer']) {
    const m = wordMap[cls] ?? {};
    const missing = [1, 2, 3, 4, 5, 6].filter((w) => !m[w]);
    const label = cls === 'maker' ? 'presses' : 'blister machines';
    if (missing.length === 6) {
      out.push(F(`oe-words-${cls}`, 'warn', 'oee', `No state-word mapping for the ${label} — every stop lands in Unclassified, and the downtime Pareto is a single grey bar.`));
    } else if (missing.length > 0) {
      const names = { 1: 'running', 2: 'starved', 3: 'blocked', 4: 'fault', 5: 'changeover', 6: 'idle' };
      out.push(F(`oe-words-${cls}-partial`, 'warn', 'oee', `${label}: state word(s) ${missing.map((w) => `${w} ("${names[w]}")`).join(', ')} unmapped — that time lands in Unclassified.`));
    }
  }
  if ((o.reasonTree ?? []).length === 0) {
    out.push(F('oe-reasons', 'warn', 'oee', 'No downtime reason tree — operators can classify stops only as "stopped".'));
  }
  if (!(o.shortStopThresholdMin > 0)) {
    out.push(F('oe-shortstop', 'warn', 'oee', 'Short-stop threshold is zero — every 6-second foil splice becomes a formal downtime event demanding a reason.'));
  }
  if ((o.calendar?.breaks ?? []).length === 0) {
    out.push(F('oe-breaks', 'warn', 'oee', 'No breaks configured — lunch will be booked as a 30-minute breakdown.'));
  }
  return out;
}

// ---------------------------------------------------------------------------
export function validateQuality(config) {
  const out = [];
  const q = config.quality;
  const lines = linesOfPlant(config);
  const tags = config.connectivity.tagMap ?? [];

  if ((q.inspectionPlans ?? []).length === 0) {
    out.push(F('ql-plans', 'warn', 'quality', 'No inspection plans — every injected defect ships unchallenged.'));
  }
  for (const p of q.inspectionPlans ?? []) {
    const machine = config.plantModel.nodes.find((n) => n.id === p.machineId);
    if (!machine) {
      out.push(F(`ql-plan-${p.id}`, 'warn', 'quality', `Inspection plan ${p.id} points at a machine that no longer exists.`));
      continue;
    }
    if ((p.checks ?? []).length === 0) {
      out.push(F(`ql-empty-${p.id}`, 'warn', 'quality', `Inspection plan at ${machine.code} has no checks — it inspects nothing.`));
    }
    const needsSignal = p.source === 'inlineGauge'
      ? ((p.checks ?? []).some((c) => (c.characteristic ?? '').toLowerCase().includes('hardness')) ? 'hardnessN' : 'tabletWeightMg')
      : p.source === 'checkweigher' ? 'caseWeightKg' : null;
    if (needsSignal) {
      const tag = tags.find((t) => t.machineId === p.machineId && t.signal === needsSignal);
      if (!tag) {
        out.push(F(`ql-tag-${p.id}`, 'warn', 'quality', `Inspection plan at ${machine.code} reads "${needsSignal}", but that tag is not mapped in Shopfloor Connectivity — the plan inspects nothing.`));
      }
    }
  }
  const hasFirstOff = (q.inspectionPlans ?? []).some((p) => p.source === 'firstOff');
  if (!hasFirstOff && lines.length > 0) {
    out.push(F('ql-firstoff', 'warn', 'quality', 'No line clearance / first-off inspection after changeovers — the first cases after a product change (potent residue, wrong cartons) go straight to quarantine as "good".'));
  }
  const sev3 = (q.defectCatalog ?? []).some((d) => d.severity >= 3);
  const sev3Contained = (q.containment ?? []).some((c) => (c.minSeverity ?? 99) <= 3);
  if (sev3 && !sev3Contained) {
    out.push(F('ql-containment', 'warn', 'quality', 'Severity-3 defects exist (metal, potent cross-contamination, UI failure) but no containment rule holds them — detected or not, they ship.'));
  }
  return out;
}

// ---------------------------------------------------------------------------
export function validateConfig(config) {
  return [
    ...validatePlantModel(config),
    ...validateMaterials(config),
    ...validateOrders(config),
    ...validateApsIntegration(config),
    ...validateConnectivity(config),
    ...validateTraceability(config),
    ...validateOee(config),
    ...validateQuality(config),
  ];
}

export function findingCounts(findings) {
  return {
    errors: findings.filter((f) => f.level === 'error').length,
    warnings: findings.filter((f) => f.level === 'warn').length,
  };
}

export const MODULE_VALIDATORS = {
  plantModel: validatePlantModel,
  materials: validateMaterials,
  orders: validateOrders,
  apsIntegration: validateApsIntegration,
  connectivity: validateConnectivity,
  traceability: validateTraceability,
  oee: validateOee,
  quality: validateQuality,
};
