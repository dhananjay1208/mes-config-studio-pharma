// Executes the scripted production day (realityTape) against the trainee's
// configuration. Pure & deterministic. The tape decides what happens;
// the config decides what gets released, SEEN, classified and contained.
//
// Two layers, never mixed silently:
//   TRUTH    — what physically happened (the tape + the walk).
//   RECORDED — what the MES captured, derived from truth through the
//              trainee's Shopfloor Connectivity configuration.
// Trainee-facing KPIs read RECORDED where a real MES would (OEE, FPY,
// counters); shipping/holds/compliance read TRUTH (the plant is physical).
// results.truth carries the ground truth for the instructor debrief.
import {
  linesOfPlant, silosFeedingLine, finishingMachineByClass, connectableMachines,
} from './selectors.js';
import { deriveScheduleBank, actualChangeoverMin } from './scheduleCheck.js';
import { SIGNAL_DICTIONARY, DEVICE_CATALOG } from '../data/customer.js';
import {
  SHIFT, INCIDENTS, BREAKS, SIGNAL_FAULTS, FIXED_DEFECTS, PHYSICS, clockLabel, caseKg,
} from '../data/realityTape.js';

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

// ---------------------------------------------------------------------------
// Small time helpers — segments are { start, end, state, reason? } minute
// windows; stop windows are merged, clipped, deterministic.
// ---------------------------------------------------------------------------
function overlap(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function mergeWindows(windows) {
  const sorted = [...windows].sort((a, b) => a.start - b.start);
  const out = [];
  for (const w of sorted) {
    if (w.end <= w.start) continue;
    const last = out[out.length - 1];
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else out.push({ ...w });
  }
  return out;
}

/** Walk forward from t, consuming `mins` productive minutes around stop windows. */
function advanceThrough(t, mins, stopWindows) {
  let cur = t;
  let remaining = mins;
  const merged = mergeWindows(stopWindows);
  while (remaining > 1e-9) {
    const inside = merged.find((w) => cur >= w.start && cur < w.end);
    if (inside) { cur = inside.end; continue; }
    const next = merged.find((w) => w.start > cur);
    const room = next ? next.start - cur : Infinity;
    const step = Math.min(room, remaining);
    cur += step;
    remaining -= step;
  }
  return cur;
}

/** Productive minutes available between t0 and t1 given stop windows. */
function productiveBetween(t0, t1, stopWindows) {
  let stopped = 0;
  for (const w of mergeWindows(stopWindows)) stopped += overlap(t0, t1, w.start, w.end);
  return Math.max(0, t1 - t0 - stopped);
}

const BREAK_WINDOWS = BREAKS.map((b) => ({ start: b.startMin, end: b.startMin + b.durationMin, break: b }));

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------
export function executeRun(config) {
  const events = [];
  const log = (atMin, kind, msg) => events.push({ atMin, clock: clockLabel(atMin), kind, msg });

  const bank = deriveScheduleBank(config);
  const lines = linesOfPlant(config);
  const casePacker = finishingMachineByClass(config, 'casePacker');
  const palletizer = finishingMachineByClass(config, 'palletizer');

  // ---- Resolve tape bindings ----------------------------------------------
  const machineAt = (lineIndex, machineClass) => {
    const L = lines[lineIndex];
    if (!L) return null;
    if (machineClass === 'reservoir') return L.reservoir;
    return L.machines.find((m) => m.props.machineClass === machineClass) ?? null;
  };
  const resolveWhere = (w) => {
    if (w.scope === 'shared') {
      if (w.machineClass === 'casePacker') return casePacker;
      if (w.machineClass === 'palletizer') return palletizer;
      return null;
    }
    return machineAt(w.lineIndex, w.machineClass);
  };

  const incidentsByMachine = new Map(); // machineId -> [{start,end,incident}]
  for (const inc of INCIDENTS) {
    const m = resolveWhere(inc.where);
    if (!m) continue;
    if (!incidentsByMachine.has(m.id)) incidentsByMachine.set(m.id, []);
    incidentsByMachine.get(m.id).push({ start: inc.startMin, end: inc.startMin + inc.durationMin, incident: inc });
  }

  // ---- Per-line ground-truth walk ------------------------------------------
  const caseRateOf = (m) => {
    if (!m) return 0;
    const p = m.props;
    if (p.machineClass === 'maker') return num(p.ratedTabletsMin) / PHYSICS.tabletsPerCase;
    // The blister machine counts blisters (400/case), the UI unit is the carton (200/case).
    if (p.machineClass === 'packer') return num(p.ratedBlistersMin) / (PHYSICS.blistersPerCase ?? PHYSICS.cartonsPerCase);
    if (p.machineClass === 'cartoner') return num(p.ratedCartonsMin) / PHYSICS.cartonsPerCase;
    return Infinity;
  };

  const runResults = [];          // flat, all lines
  const lineResults = [];
  const defects = [];             // { id, defectCode, desc, lineIndex|shared, runId, cases|packs, detectedBy, contained, held, shipped }
  const identityFindings = [];
  const siloLevels = new Map();   // siloId -> remaining kg (truth ledger)
  for (const s of config.plantModel.nodes.filter((n) => n.type === 'silo')) {
    siloLevels.set(s.id, num(s.props.startLevelKg));
  }

  lines.forEach((L, lineIndex) => {
    const runs = bank.runsByLine[L.line.code] ?? [];
    const maker = L.maker; const packer = L.packer; const cartoner = L.cartoner;
    const bufferMin = num(L.reservoir?.props.bufferMin, 0);
    const lineRate = Math.min(caseRateOf(maker), caseRateOf(packer), caseRateOf(cartoner)) || 0;

    const makerFaults = (maker && incidentsByMachine.get(maker.id)) || [];
    const packerFaults = (packer && incidentsByMachine.get(packer.id)) || [];
    const cartonerFaults = (cartoner && incidentsByMachine.get(cartoner.id)) || [];

    // Output stop windows: breaks + packer/cartoner faults in full + the part
    // of each maker fault the reservoir cannot absorb.
    const makerExcess = makerFaults
      .filter((w) => (w.end - w.start) > bufferMin)
      .map((w) => ({ start: w.start + bufferMin, end: w.end, incident: w.incident }));
    const outputStops = [
      ...BREAK_WINDOWS,
      ...packerFaults, ...cartonerFaults, ...makerExcess,
    ];
    // The maker itself stops for: breaks, its own faults, packer stops beyond
    // the reservoir (blocked).
    const packerExcess = packerFaults
      .filter((w) => (w.end - w.start) > bufferMin)
      .map((w) => ({ start: w.start + bufferMin, end: w.end, incident: w.incident, blocked: true }));

    // Truth state segments per machine.
    const makerSegs = [];
    const packerSegs = [];
    const changeovers = [];       // { fromSku, toSku, start, end, kind }
    let t = 0;
    let prevSku = null;
    const lineRunResults = [];

    // Validated potent-product clean owed from last night on this line?
    if (lineIndex === PHYSICS.potentCleanOwedOnLineIndex) {
      if (config.apsIntegration.purgeEnforcement?.enabled) {
        log(0, 'purge', `${L.line.code}: the validated clean after last night's Zentrix 50 mg run was dispatched into the night window (clean + swab + QA release) — line opens released and clean.`);
      } else {
        log(0, 'purge', `${L.line.code}: no clean enforcement — last night's Zentrix residue is still in the line and no swab was taken.`);
      }
    }

    runs.forEach((run, k) => {
      const sku = run.sku;
      // -- changeover (truth physics) --
      let co = 0;
      if (k > 0 && prevSku && sku) co = actualChangeoverMin(prevSku, sku);
      if (co > 0) {
        const coEnd = advanceThrough(t, co, BREAK_WINDOWS);
        changeovers.push({ fromSku: prevSku?.code ?? '—', toSku: sku?.code ?? '—', start: t, end: coEnd, netMin: co, kind: co >= PHYSICS.changeoverMin.potentClean ? 'purge' : co >= PHYSICS.changeoverMin.formatChange ? 'format' : co >= PHYSICS.changeoverMin.blendChange ? 'blend' : 'minor' });
        makerSegs.push({ start: t, end: coEnd, state: 'changeover' });
        packerSegs.push({ start: t, end: coEnd, state: 'changeover' });
        log(t, 'changeover', `${L.line.code}: changeover ${prevSku?.code} → ${sku?.code} (${co} min actual).`);
        t = coEnd;
      }

      // -- start discipline: never before the APS planned start --
      const actualStart = Math.max(t, num(run.startMin, 0));
      if (actualStart > t) {
        emitIdle(makerSegs, t, actualStart);
        emitIdle(packerSegs, t, actualStart);
        t = actualStart;
      }

      // -- silo feed (truth ledger) --
      let qtyTarget = num(run.qtyCases, 0);
      let qtyProduced = qtyTarget;
      let starved = false;
      if (sku) {
        const feeding = silosFeedingLine(config, L.line.code).filter((s) => s.props.blendCode === sku.blendCode);
        const availableKg = feeding.reduce((sum, s) => sum + (siloLevels.get(s.id) ?? 0), 0);
        const kgEach = caseKg(sku);
        const producible = Math.floor(availableKg / kgEach + 1e-9);
        if (producible < qtyTarget) {
          qtyProduced = Math.max(0, producible);
          starved = true;
        }
        // Draw down the ledger sequentially.
        let demand = qtyProduced * kgEach;
        for (const s of feeding) {
          const take = Math.min(demand, siloLevels.get(s.id) ?? 0);
          siloLevels.set(s.id, (siloLevels.get(s.id) ?? 0) - take);
          demand -= take;
        }
      } else {
        qtyProduced = 0;
        starved = true;
      }

      // -- production span --
      const prodMin = lineRate > 0 ? qtyProduced / lineRate : 0;
      const prodEnd = advanceThrough(actualStart, prodMin, outputStops);
      let runEnd = prodEnd;

      if (starved) {
        const giveUp = Math.min(SHIFT.endMin, runEnd + PHYSICS.starveGiveUpMin);
        makerSegs.push({ start: runEnd, end: giveUp, state: 'starved', reason: 'No IBC with this blend may dock here' });
        packerSegs.push({ start: runEnd, end: giveUp, state: 'starved', reason: 'Upstream starved' });
        log(runEnd, 'starve', `${L.line.code}: ${run.runId} starving — no IBC with ${sku ? sku.blendCode : 'a known blend'} may dock on this line's press. Run abandoned after ${PHYSICS.starveGiveUpMin} min (${qtyProduced}/${qtyTarget} cases).`);
        runEnd = giveUp;
      }

      // Truncate at shift end.
      if (prodEnd > SHIFT.endMin) {
        const lost = Math.round((prodEnd - SHIFT.endMin) * lineRate);
        qtyProduced = Math.max(0, qtyProduced - lost);
        runEnd = SHIFT.endMin;
        log(SHIFT.endMin, 'shift-end', `${L.line.code}: shift ended mid-run ${run.runId} — ${lost} planned cases not produced.`);
      }

      // -- truth state segments across the production span --
      const spanStops = mergeWindows(outputStops).filter((w) => overlap(actualStart, runEnd, w.start, w.end) > 0);
      let cursor = actualStart;
      for (const w of spanStops) {
        const s0 = Math.max(actualStart, w.start); const s1 = Math.min(runEnd, w.end);
        if (s0 > cursor) {
          makerSegs.push({ start: cursor, end: s0, state: 'running', runId: run.runId });
          packerSegs.push({ start: cursor, end: s0, state: 'running', runId: run.runId });
        }
        const isBreak = BREAK_WINDOWS.some((b) => b.start === w.start && b.end === w.end);
        const pf = packerFaults.find((f) => overlap(f.start, f.end, s0, s1) > 0);
        const mx = makerExcess.find((f) => overlap(f.start, f.end, s0, s1) > 0);
        if (isBreak) {
          makerSegs.push({ start: s0, end: s1, state: 'idle', reason: 'Break' });
          packerSegs.push({ start: s0, end: s1, state: 'idle', reason: 'Break' });
        } else if (pf) {
          packerSegs.push({ start: s0, end: s1, state: 'fault', reason: pf.incident.reason, incidentId: pf.incident.id });
          // Maker: blocked only for the excess beyond the reservoir.
          const px = packerExcess.find((x) => x.incident.id === pf.incident.id);
          if (px && overlap(px.start, px.end, s0, s1) > 0) {
            makerSegs.push({ start: Math.max(s0, px.start), end: s1, state: 'blocked', reason: 'Reservoir full — packer down' });
            if (px.start > s0) makerSegs.push({ start: s0, end: px.start, state: 'running', runId: run.runId });
          } else {
            makerSegs.push({ start: s0, end: s1, state: 'running', runId: run.runId, note: 'reservoir absorbing' });
          }
        } else if (mx) {
          makerSegs.push({ start: s0, end: s1, state: 'fault', reason: mx.incident.reason, incidentId: mx.incident.id });
          packerSegs.push({ start: s0, end: s1, state: 'starved', reason: 'Reservoir empty — maker down' });
        } else {
          // A cartoner (downstream) stop: the blister is blocked, the press is
          // shielded by the hold — attribute the incident so OEE can classify it.
          const cf = cartonerFaults.find((f) => overlap(f.start, f.end, s0, s1) > 0);
          makerSegs.push({ start: s0, end: s1, state: 'running', runId: run.runId, note: 'hold absorbing' });
          packerSegs.push({ start: s0, end: s1, state: 'fault', reason: cf?.incident.reason ?? 'stop', incidentId: cf?.incident.id });
        }
        cursor = s1;
      }
      if (runEnd > cursor && !starved) {
        makerSegs.push({ start: cursor, end: runEnd, state: 'running', runId: run.runId });
        packerSegs.push({ start: cursor, end: runEnd, state: 'running', runId: run.runId });
      }
      // Maker's own short faults fully absorbed by the reservoir: overlay fault
      // state on the maker where the output kept flowing.
      for (const f of makerFaults) {
        if ((f.end - f.start) <= bufferMin && overlap(actualStart, runEnd, f.start, f.end) > 0) {
          makerSegs.push({ start: f.start, end: f.end, state: 'fault', reason: f.incident.reason, incidentId: f.incident.id, absorbed: true });
        }
      }

      log(actualStart, 'run-start', `${L.line.code}: ${run.runId} (${sku?.code ?? run.orderNo ?? '?'}) started — planned ${clockLabel(num(run.startMin, 0))}.`);
      log(runEnd, 'run-end', `${L.line.code}: ${run.runId} finished — ${qtyProduced}/${qtyTarget} cases.`);

      lineRunResults.push({
        runId: run.runId, orderNo: run.orderNo, lineCode: L.line.code, lineIndex,
        skuCode: sku?.code ?? null, sku, qtyPlanned: qtyTarget, qtyProduced,
        plannedStart: num(run.startMin, 0), plannedEnd: num(run.endMin, 0),
        actualStart, actualEnd: runEnd, changeoverMin: co, starved,
        slipMin: Math.round(actualStart - num(run.startMin, 0)),
      });

      // A run that never produced (starved to zero) never actually loaded its
      // blend — the line's changeover state stays with the last REAL run.
      if (sku && qtyProduced > 0) prevSku = sku;
      t = runEnd;
    });

    // Idle to shift end.
    if (t < SHIFT.endMin) {
      emitIdle(makerSegs, t, SHIFT.endMin);
      emitIdle(packerSegs, t, SHIFT.endMin);
    }

    runResults.push(...lineRunResults);
    lineResults.push({
      lineIndex, lineCode: L.line.code, lineName: L.line.name,
      maker, packer, cartoner, reservoir: L.reservoir, bufferMin, lineRate,
      runs: lineRunResults, changeovers,
      truth: { makerSegs: mergeSegs(makerSegs), packerSegs: mergeSegs(packerSegs) },
    });
  });

  // ---- Conditional defects (physics-gated) ---------------------------------
  const purgeOn = Boolean(config.apsIntegration.purgeEnforcement?.enabled);
  const purgeLine = lineResults[PHYSICS.potentCleanOwedOnLineIndex];
  if (!purgeOn && purgeLine && purgeLine.runs.length > 0) {
    const firstRun = purgeLine.runs[0];
    const n = Math.min(PHYSICS.contaminationCasesIfNoPurge, firstRun.qtyProduced);
    if (n > 0 && firstRun.sku && !firstRun.sku.potent) {
      defects.push({
        id: 'DEF-XCONT', defectCode: 'XCONT-POT', lineIndex: purgeLine.lineIndex, runId: firstRun.runId,
        cases: n, desc: `First ${n} cases of ${firstRun.skuCode} carry Zentrix 50 mg residue from last night's run — no validated clean, no swab (potent cross-contamination).`,
      });
    }
  }

  // Frozen NIR probe → out-of-window cases on the affected line: the wet
  // sub-lot the dryer discharged while the probe lied is pressed later
  // (affectsWindow); without it the excursion window itself is used.
  const frozenFault = SIGNAL_FAULTS.find((f) => f.id === 'SF-FROZEN-NIR');
  if (frozenFault && lineResults[frozenFault.lineIndex]) {
    const L = lineResults[frozenFault.lineIndex];
    const [w0, w1] = frozenFault.affectsWindow ?? [frozenFault.outOfSpecFromMin, frozenFault.endMin];
    let badCases = 0;
    for (const r of L.runs) {
      const w = overlap(r.actualStart, r.actualEnd, w0, w1);
      // Subtract stop time inside that overlap using the truth packer segments.
      const stopped = L.truth.packerSegs
        .filter((s) => s.state !== 'running')
        .reduce((sum, s) => sum + overlap(Math.max(r.actualStart, w0), Math.min(r.actualEnd, w1), s.start, s.end), 0);
      badCases += Math.max(0, Math.round((w - stopped) * L.lineRate));
    }
    if (badCases > 0) {
      defects.push({
        id: 'DEF-LOD', defectCode: 'LOD-OOS', lineIndex: frozenFault.lineIndex,
        runId: null, cases: badCases,
        desc: `${badCases} cases pressed from the sub-lot ${frozenFault.machineCode ?? 'the dryer'} discharged at ${frozenFault.trueDrift.to}% LOD (window ≤ ${PHYSICS.lodWindow.hi}%) while its NIR probe read a frozen ${frozenFault.frozenValue}%.`,
        window: [w0, w1],
      });
    }
  }

  // Fixed defects.
  for (const d of FIXED_DEFECTS) {
    defects.push({
      id: d.id, defectCode: d.defectCode, lineIndex: d.lineIndex ?? null, shared: Boolean(d.shared),
      runId: null, cases: d.badCaseCount ?? d.caseCount ?? 0, packs: d.packCount ?? 0,
      desc: d.desc, window: d.window ?? (d.atMin ? [d.atMin, d.atMin] : null),
    });
  }

  // ---- Connectivity recording layer ----------------------------------------
  const conn = deriveRecordedLayer(config, lineResults, { casePacker, palletizer, incidentsByMachine });

  // ---- Serialization, aggregation, genealogy --------------------------------
  const trace = deriveTraceability(config, lineResults, defects, identityFindings, log);

  // ---- Quality: detection & containment -------------------------------------
  const quality = applyQuality(config, lineResults, defects, conn, trace, log);

  // ---- OEE from the RECORDED layer -------------------------------------------
  const oee = deriveOee(config, lineResults, conn);

  // ---- Integration log (APS actuals + EU Hub upload) ------------------------
  const integrationLog = deriveIntegrationLog(config, lineResults, trace, quality);

  // ---- KPIs -------------------------------------------------------------------
  const kpis = deriveKpis(config, bank, lineResults, quality, trace, oee, conn, integrationLog);

  events.sort((a, b) => a.atMin - b.atMin);

  return {
    scheduleBank: bank,
    lines: lineResults,
    runs: runResults,
    events,
    defects,
    identityFindings,
    connectivity: conn,
    trace,
    quality,
    oee,
    integrationLog,
    kpis,
    truth: {
      siloEndLevels: Object.fromEntries([...siloLevels.entries()]),
      incidents: INCIDENTS,
      breaks: BREAKS,
      signalFaults: SIGNAL_FAULTS,
    },
  };
}

/** Emit idle time split at break windows, so breaks stay classifiable. */
function emitIdle(segs, start, end) {
  let cursor = start;
  for (const b of BREAK_WINDOWS) {
    const s0 = Math.max(cursor, b.start);
    const s1 = Math.min(end, b.end);
    if (s1 > s0) {
      if (s0 > cursor) segs.push({ start: cursor, end: s0, state: 'idle' });
      segs.push({ start: s0, end: s1, state: 'idle', reason: 'Break' });
      cursor = s1;
    }
  }
  if (end > cursor) segs.push({ start: cursor, end, state: 'idle' });
}

/** Normalize a segment list: sort, clip to shift, drop zero-length. */
function mergeSegs(segs) {
  return segs
    .map((s) => ({ ...s, start: Math.max(SHIFT.startMin, s.start), end: Math.min(SHIFT.endMin, s.end) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

// ---------------------------------------------------------------------------
// RECORDED layer: what the MES actually captured, per machine × signal.
// ---------------------------------------------------------------------------
function deriveRecordedLayer(config, lineResults, extra) {
  const tagMap = config.connectivity.tagMap ?? [];
  const connections = config.connectivity.connections ?? [];
  const rules = config.connectivity.signalRules ?? {};
  const machines = connectableMachines(config);

  const grid = [];          // one row per machine × required signal
  const signalEvents = [];  // flatline / stale alerts the MES raised
  let fidelityTotal = 0;
  let fidelityWrong = 0;

  const lineIndexOfMachine = new Map();
  lineResults.forEach((L) => {
    for (const m of [L.maker, L.packer, L.cartoner, L.reservoir]) {
      if (m) lineIndexOfMachine.set(m.id, L.lineIndex);
    }
  });

  for (const m of machines) {
    const cls = m.props.machineClass;
    const dict = SIGNAL_DICTIONARY[cls] ?? [];
    const catalog = DEVICE_CATALOG[m.code] ?? null;
    const connected = connections.some((c) => c.machineId === m.id && c.enabled !== false);
    const lineIndex = lineIndexOfMachine.get(m.id) ?? null;
    const L = lineIndex != null ? lineResults[lineIndex] : null;

    for (const req of dict) {
      const tag = tagMap.find((tg) => tg.machineId === m.id && tg.signal === req.signal);
      const row = {
        machineId: m.id, machineCode: m.code, machineClass: cls,
        signal: req.signal, label: req.label, kind: req.kind, critical: req.critical,
        status: 'unmapped', factor: null, pollMs: null, notes: [],
      };
      fidelityTotal += SHIFT.endMin;

      if (!connected) {
        row.status = 'noConnection';
        row.notes.push('Machine has no connection');
        fidelityWrong += SHIFT.endMin;
      } else if (!tag) {
        row.status = 'unmapped';
        fidelityWrong += SHIFT.endMin;
      } else {
        const node = catalog?.nodes?.find((n) => n.nodeId === tag.nodeId) ?? null;
        row.pollMs = num(tag.pollMs, 1000);
        if (!node) {
          row.status = 'badNode';
          row.notes.push('nodeId not in the device address space');
          fidelityWrong += SHIFT.endMin;
        } else if (node.signal !== req.signal) {
          row.status = 'crossSignal';
          row.notes.push(`Bound to ${node.nodeId} — that register is "${node.desc}"`);
          fidelityWrong += SHIFT.endMin;
        } else {
          const factor = num(tag.scale, 1) / node.unitScale;
          row.factor = factor;
          if (Math.abs(factor - 1) > 1e-9) {
            row.status = 'scaleError';
            row.notes.push(`Recorded values are ×${factor} of reality (${node.desc})`);
            fidelityWrong += SHIFT.endMin;
          } else {
            row.status = 'ok';
          }
        }

        // Sampling adequacy for state words: which stops does this poll see?
        if (req.signal === 'stateWord' && (row.status === 'ok' || row.status === 'scaleError') && L) {
          const pollMin = num(tag.pollMs, 1000) / 60000;
          const segsKey = cls === 'maker' ? 'makerSegs' : cls === 'packer' ? 'packerSegs' : null;
          const segs = segsKey ? L.truth[segsKey] : [];
          const stops = segs.filter((s) => s.state === 'fault' && !s.absorbed);
          const detected = stops.filter((s) => (s.end - s.start) >= PHYSICS.microStopDetectFactor * pollMin);
          row.detectedStops = detected.length;
          row.missedStops = stops.length - detected.length;
          const missedMin = stops.reduce((sum, s) => sum + ((s.end - s.start) < PHYSICS.microStopDetectFactor * pollMin ? (s.end - s.start) : 0), 0);
          fidelityWrong += missedMin;
          if (row.missedStops > 0) row.notes.push(`${row.missedStops} stop(s) shorter than the sampling can see`);
        }
      }
      grid.push(row);
    }
  }

  // Signal faults vs the rules.
  const frozen = SIGNAL_FAULTS.find((f) => f.id === 'SF-FROZEN-NIR');
  let frozenCaught = false;
  if (frozen) {
    // The probe lives on a named machine (FBD2, the dryer) when the tape says
    // so; otherwise on the affected line's press.
    const L = lineResults[frozen.lineIndex];
    const probeMachine = frozen.machineCode
      ? (machines.find((m) => m.code === frozen.machineCode) ?? null)
      : (L?.maker ?? null);
    const row = grid.find((r) => probeMachine && r.machineId === probeMachine.id && r.signal === frozen.signal);
    const mapped = row && (row.status === 'ok' || row.status === 'scaleError');
    const flatline = rules.flatline ?? {};
    if (mapped && flatline.enabled && num(flatline.windowMin, 0) > 0 && num(flatline.windowMin, 0) <= (frozen.endMin - frozen.startMin)) {
      frozenCaught = true;
      const at = frozen.startMin + num(flatline.windowMin, 0);
      signalEvents.push({
        atMin: at, clock: clockLabel(at), kind: 'flatline',
        msg: `${probeMachine.code} ${frozen.signal} frozen at ${frozen.frozenValue} % for ${flatline.windowMin} min — probe flagged dead, sub-lot quarantined, lab LOD sample ordered.`,
      });
    } else if (mapped) {
      // The MES happily recorded the frozen value.
      fidelityWrong += frozen.endMin - frozen.startMin;
    }
    if (row) row.frozen = { caught: frozenCaught, window: [frozen.startMin, frozen.endMin] };
  }

  const drop = SIGNAL_FAULTS.find((f) => f.id === 'SF-STATE-DROP');
  let staleCaught = false;
  if (drop) {
    const L = lineResults[drop.lineIndex];
    const maker = L?.maker;
    const row = grid.find((r) => maker && r.machineId === maker.id && r.signal === 'stateWord');
    const mapped = row && row.status === 'ok';
    const staleSec = num(rules.staleTimeoutSec, 0);
    if (mapped && staleSec > 0 && staleSec <= (drop.endMin - drop.startMin) * 60) {
      staleCaught = true;
      signalEvents.push({
        atMin: drop.startMin, clock: clockLabel(drop.startMin), kind: 'stale',
        msg: `${maker.code} controller stopped answering — state marked STALE after ${staleSec}s instead of trusting "running".`,
      });
    } else if (mapped) {
      fidelityWrong += drop.endMin - drop.startMin;
    }
    if (row) row.stale = { caught: staleCaught, window: [drop.startMin, drop.endMin] };
  }

  // LOD trace for the ConnectivityHealth sparkline (5-min samples).
  const lodTrace = [];
  if (frozen) {
    const [t0, t1] = frozen.traceWindow ?? [frozen.startMin - 60, frozen.endMin + 60];
    const baseline = frozen.baseline ?? frozen.trueDrift.from;
    const breathe = frozen.breathe ?? 0.2;
    for (let t = t0; t <= t1; t += 5) {
      const inWindow = t >= frozen.startMin && t <= frozen.endMin;
      const frac = inWindow ? (t - frozen.startMin) / (frozen.endMin - frozen.startMin) : 0;
      const truth = inWindow
        ? frozen.trueDrift.from + (frozen.trueDrift.to - frozen.trueDrift.from) * frac
        : baseline + breathe * Math.sin(t / 40);
      const recorded = inWindow ? frozen.frozenValue : truth;
      lodTrace.push({ atMin: t, truth: Math.round(truth * 100) / 100, recorded: Math.round(recorded * 100) / 100 });
    }
  }

  const dataFidelity = fidelityTotal > 0 ? Math.max(0, 1 - fidelityWrong / fidelityTotal) : 0;
  return { grid, signalEvents, lodTrace, dataFidelity, frozenCaught, staleCaught };
}

// ---------------------------------------------------------------------------
// Serialization, aggregation, genealogy
// ---------------------------------------------------------------------------
/** GS1 mod-10 check digit (weights 3/1 from the right) appended to 17 digits. */
function sscc18(seventeen) {
  const d = String(seventeen).replace(/\D/g, '').slice(0, 17).padStart(17, '0');
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(d[16 - i]) * (i % 2 === 0 ? 3 : 1);
  return d + String((10 - (sum % 10)) % 10);
}

function deriveTraceability(config, lineResults, defects, identityFindings, log) {
  const ser = config.traceability.serialization ?? {};
  const agg = config.traceability.aggregation?.levels ?? [];
  const gen = config.traceability.genealogy ?? {};
  const trackPoints = config.traceability.trackPoints ?? [];
  const repo = config.traceability.repository ?? {};

  // Identity law: the UI is printed & verified ONLY at the cartoner's
  // serialization station (PHYSICS.uiPrintMachineClass).
  const uiPrintOk = ser.uiPrintMachineClass === PHYSICS.uiPrintMachineClass;
  if (ser.uiPrintMachineClass && !uiPrintOk) {
    identityFindings.push({
      id: 'idf-ui-place', level: 'error',
      msg: `UI printing is configured at the ${ser.uiPrintMachineClass} — a UI belongs to a CARTON and is printed & verified at the cartoner's serialization station only.`,
    });
  }

  const levelsByName = Object.fromEntries(agg.map((l) => [l.level, l]));
  const perRun = [];
  const consumptionRecords = [];
  let unserializedPacks = 0;
  let unverifiedShippedPacks = 0;
  let voidedPacks = 0;
  let aggregationGaps = 0;
  let genealogyGaps = 0;

  const defUi = defects.find((d) => d.defectCode === 'UI-FAIL');

  lineResults.forEach((L) => {
    L.runs.forEach((r) => {
      if (!r.sku || r.qtyProduced <= 0) return;
      const packs = r.qtyProduced * PHYSICS.cartonsPerCase;
      const range = config.materials.uiRanges.find(
        (x) => x.market === r.sku.market && (x.assignedSkus || []).includes(r.sku.code)
      );
      const serialized = Boolean(uiPrintOk && range);
      if (!serialized) unserializedPacks += packs;

      // Bad prints that fall inside this run's window (line 0 only in the tape).
      let badPrints = 0;
      if (defUi && defUi.lineIndex === L.lineIndex && defUi.window) {
        const w = overlap(r.actualStart, r.actualEnd, defUi.window[0], defUi.window[1]);
        const span = Math.max(1, defUi.window[1] - defUi.window[0]);
        badPrints = Math.round(defUi.packs * (w / span));
      }
      let runVoided = 0;
      let runUnverifiedShipped = 0;
      if (serialized && badPrints > 0) {
        if (ser.cameraVerify) {
          runVoided = Math.round(badPrints * PHYSICS.uiVerifyCatchRate);
          voidedPacks += runVoided;
        } else {
          runUnverifiedShipped = badPrints;
          unverifiedShippedPacks += badPrints;
        }
      }

      // Aggregation completeness.
      const cartonsOk = Boolean(levelsByName.carton);
      const casesOk = Boolean(levelsByName.case);
      const palletOk = Boolean(levelsByName.pallet);
      let runGaps = 0;
      if (!cartonsOk) runGaps += r.qtyProduced * PHYSICS.cartonsPerCase; // cartons unresolvable
      if (!casesOk) runGaps += r.qtyProduced;
      if (!palletOk) runGaps += Math.ceil(r.qtyProduced / (PHYSICS.casesPerPallet ?? 48));
      aggregationGaps += runGaps;

      // Genealogy: the blend-lot (IBC) handoff at the press + material lots.
      // The lot named is the one carried by the IBC that fed this run (from the
      // IBC's name, e.g. "IBC-0012 — BLND-1834 …"), else a synthetic lot id.
      const makerTp = trackPoints.some((tp) => tp.machineId === L.maker?.id);
      const feedingIbc = silosFeedingLine(config, r.lineCode).find((s) => s.props.blendCode === r.sku.blendCode);
      const cfLot = feedingIbc?.name?.match(/BLND-\d+/)?.[0]
        ?? `BLND-${String(1800 + L.lineIndex * 20 + Number(r.runId?.slice(-2) ?? 0))}`;
      const cfCaptured = Boolean(gen.blendLotCapture && makerTp);
      if (!cfCaptured) genealogyGaps += 1;

      const bom = config.materials.boms.find((b) => b.skuCode === r.sku.code);
      const lotIds = gen.materialLotCapture ?? [];
      for (const line of bom?.lines ?? []) {
        const item = config.materials.items.find((i) => i.id === line.materialId);
        if (!item?.lotTracked) continue;
        const machine = line.consumedAtMachineClass === 'maker' ? L.maker
          : line.consumedAtMachineClass === 'reservoir' ? L.reservoir
          : line.consumedAtMachineClass === 'packer' ? L.packer
          : line.consumedAtMachineClass === 'cartoner' ? L.cartoner : null;
        // Capture happens at a track point OR at an aggregation scanner on
        // that machine class (the scanners ARE data-collection points).
        const scanHere = agg.some((lv) => lv.scanMachineClass === line.consumedAtMachineClass);
        const tpHere = machine ? trackPoints.some((tp) => tp.machineId === machine.id) : false;
        const captured = lotIds.includes(item.id) && (tpHere || scanHere);
        if (!captured) genealogyGaps += 1;
        consumptionRecords.push({
          runId: r.runId, lineCode: r.lineCode, machineCode: machine?.code ?? '—',
          materialId: item.id, materialCode: item.code, lot: `LOT-${item.code}-W29`,
          captured, gap: !captured,
        });
      }

      // Exemplar UI strings for the drill-down view.
      const uiPrefix = range ? range.rangeStart.replace(/\d+$/, '') : null;
      perRun.push({
        runId: r.runId, lineCode: r.lineCode, skuCode: r.sku.code, market: r.sku.market,
        packs, serialized, rangeId: range?.id ?? null,
        badPrints, voided: runVoided, unverifiedShipped: runUnverifiedShipped,
        cartons: r.qtyProduced * PHYSICS.cartonsPerCase, cases: r.qtyProduced,
        aggregation: { carton: cartonsOk, case: casesOk, pallet: palletOk, gaps: runGaps },
        blendLot: cfLot, blendLotCaptured: cfCaptured,
        exemplarUi: uiPrefix ? `(01)${r.sku.gtin ?? '00359123000108'}(21)${uiPrefix}${String(100000 + Math.round(r.actualStart) * 7).slice(-6)}` : null,
        exemplarSscc: palletOk ? `SSCC ${sscc18(`0035912308${String(1000000 + Math.round(r.actualEnd) * 13).slice(-7)}`)}` : null,
      });

      if (!serialized) {
        log(r.actualEnd, 'serialization', `${r.runId}: ${packs.toLocaleString()} cartons produced WITHOUT valid UIs${range ? '' : ` — no ${r.sku.market} serial pool assigned`}.`);
      }
    });
  });

  return {
    perRun, consumptionRecords,
    unserializedPacks, unverifiedShippedPacks, voidedPacks,
    aggregationGaps, genealogyGaps,
    repositoryEnabled: Boolean(repo.enabled),
    bufferAndRetry: Boolean(repo.bufferAndRetry),
  };
}

// ---------------------------------------------------------------------------
// Quality: which injected defects get DETECTED (needs the right plan AND the
// right tags), and which detected defects get CONTAINED (containment rules).
// ---------------------------------------------------------------------------
function applyQuality(config, lineResults, defects, conn, trace, log) {
  const plans = config.quality.inspectionPlans ?? [];
  const containment = config.quality.containment ?? [];
  const catalog = config.quality.defectCatalog ?? [];

  const tagOk = (machineId, signal) => {
    const row = conn.grid.find((r) => r.machineId === machineId && r.signal === signal);
    return row?.status === 'ok';
  };
  const planAt = (machineId, source, characteristicIncludes) => plans.find((p) =>
    p.machineId === machineId && p.source === source &&
    (p.checks ?? []).some((c) => (c.characteristic ?? '').toLowerCase().includes(characteristicIncludes))
  );

  const sev = (code) => catalog.find((d) => d.code === code)?.severity ?? 1;
  const containedBy = (severity) => containment.filter((c) => severity >= num(c.minSeverity, 99));

  const results = [];
  let heldCases = 0;
  let defectsCaught = 0;
  let defectsEscaped = 0;
  let shippedDefectiveCases = 0;

  for (const d of defects) {
    const L = d.lineIndex != null ? lineResults[d.lineIndex] : null;
    let detected = false;
    let detectedBy = null;

    if (d.defectCode === 'HARD-DEV' && L?.maker) {
      const plan = planAt(L.maker.id, 'inlineGauge', 'hardness');
      if (plan && tagOk(L.maker.id, 'hardnessN')) { detected = true; detectedBy = 'SPC on the IPC hardness auto-tester'; }
    } else if (d.defectCode === 'LOD-OOS') {
      if (conn.frozenCaught) { detected = true; detectedBy = 'Flatline rule → sub-lot quarantined, lab LOD sample'; }
    } else if (d.defectCode === 'XCONT-POT' && L?.maker) {
      const plan = plans.find((p) => p.machineId === L.maker.id && p.source === 'firstOff');
      if (plan) { detected = true; detectedBy = 'Line clearance + first-off after changeover'; }
    } else if (d.defectCode === 'CASE-SHORT') {
      const cp = conn.grid.find((r) => r.machineClass === 'casePacker' && r.signal === 'caseWeightKg');
      const plan = plans.find((p) => {
        const machine = cp && p.machineId === cp.machineId;
        return machine && p.source === 'checkweigher';
      });
      if (plan && cp?.status === 'ok') { detected = true; detectedBy = 'Case checkweigher'; }
    } else if (d.defectCode === 'SEAL-DMG') {
      // The packer auto-rejects foil damage — it never ships; the MES only
      // SEES it if the reject counter is mapped.
      const visible = L?.packer ? tagOk(L.packer.id, 'rejSeal') : false;
      results.push({ ...d, severity: sev(d.defectCode), detected: visible, detectedBy: visible ? 'Blister seal-inspection reject counter' : null, autoRejected: true, held: 0, shipped: 0 });
      if (visible) defectsCaught += 1; // counted as caught (machine handled it)
      continue;
    } else if (d.defectCode === 'UI-FAIL') {
      // Handled in serialization: camera verify voids, else ships unverified.
      const caught = trace.voidedPacks > 0;
      results.push({
        ...d, severity: sev(d.defectCode), detected: caught,
        detectedBy: caught ? 'UI print & verify camera' : null,
        held: 0, shipped: caught ? 0 : d.packs,
      });
      if (caught) defectsCaught += 1; else defectsEscaped += 1;
      continue;
    }

    const severity = sev(d.defectCode);
    const rules = containedBy(severity);
    const cases = num(d.cases, 0);
    let held = 0;
    let shipped = 0;
    if (detected) {
      defectsCaught += 1;
      if (rules.some((c) => c.action === 'holdCases') || severity >= 3) {
        held = cases;
        heldCases += cases;
        log(d.window?.[1] ?? 400, 'containment', `${d.defectCode}: ${cases} case(s) held — ${detectedBy}.`);
      } else {
        // Detected but no containment: recorded, still ships.
        shipped = cases;
        shippedDefectiveCases += cases;
      }
    } else {
      defectsEscaped += 1;
      shipped = cases;
      shippedDefectiveCases += cases;
    }
    results.push({ ...d, detected, detectedBy, severity, held, shipped });
  }

  return { results, heldCases, defectsCaught, defectsEscaped, shippedDefectiveCases };
}

// ---------------------------------------------------------------------------
// OEE — computed from the RECORDED timeline (state-word mapping + calendar +
// short-stop threshold), with classification accuracy vs truth.
// The line waterfall is bucketed on the PACKER (output) timeline.
// ---------------------------------------------------------------------------
function deriveOee(config, lineResults, conn) {
  const stateModel = config.oee.stateModel ?? [];
  const wordMap = config.oee.stateWordMap ?? {};
  const threshold = num(config.oee.shortStopThresholdMin, 0);
  const breaksCfg = config.oee.calendar?.breaks ?? [];

  const catOfState = (id) => stateModel.find((s) => s.id === id)?.category ?? null;
  const STATE_TO_WORD = { running: 1, starved: 2, blocked: 3, fault: 4, changeover: 5, idle: 6 };
  const wordMappedCat = (cls, state) => {
    const id = wordMap[cls]?.[STATE_TO_WORD[state]];
    return id ? catOfState(id) : null;
  };
  const breakConfigured = (seg) => breaksCfg.some((b) => {
    const [h, m] = String(b.start ?? '').split(':').map(Number);
    if (!Number.isFinite(h)) return false;
    const s = (h - 6) * 60 + (m || 0);
    return overlap(seg.start, seg.end, s, s + num(b.minutes, 0)) >= (seg.end - seg.start) * 0.9;
  });

  const perLine = [];
  let trueStopMin = 0;      // classifiable truth: breaks + changeovers + faults + blocked/starved
  let correctMin = 0;
  let unclassifiedMin = 0;

  for (const L of lineResults) {
    const buckets = {
      production: 0, plannedStop: 0, notScheduled: 0, changeover: 0,
      unplannedStop: 0, shortStop: 0, blockedStarved: 0, unaccounted: 0, unclassified: 0,
    };
    let productionMinRecorded = 0;

    const cls = 'packer';
    const stateRow = conn.grid.find((r) => L.packer && r.machineId === L.packer.id && r.signal === 'stateWord');
    const stateMapped = Boolean(stateRow && stateRow.status === 'ok');
    const pollMin = stateMapped ? num(stateRow.pollMs, 1000) / 60000 : 0;

    for (const seg of L.truth.packerSegs) {
      const dur = seg.end - seg.start;
      if (dur <= 0) continue;
      const isBreak = seg.state === 'idle' && seg.reason === 'Break';
      const isClassifiableStop = isBreak || ['fault', 'changeover', 'blocked', 'starved'].includes(seg.state);
      if (isClassifiableStop) trueStopMin += dur;

      if (!stateMapped) {
        // No state word at all: production time still shows as output, but
        // every stop minute is a grey hole.
        if (seg.state === 'running') { buckets.production += dur; productionMinRecorded += dur; }
        else { buckets.unclassified += dur; unclassifiedMin += dur; }
        continue;
      }

      // Stops shorter than the sampling can see are recorded as running.
      const invisible = seg.state === 'fault' && !seg.absorbed && dur < PHYSICS.microStopDetectFactor * pollMin;

      if (seg.state === 'running' || seg.absorbed) {
        buckets.production += dur;
        productionMinRecorded += dur;
      } else if (invisible) {
        buckets.unaccounted += dur; // truth stopped; MES saw green
      } else if (isBreak) {
        if (breakConfigured(seg)) { buckets.plannedStop += dur; correctMin += dur; }
        else { buckets.unclassified += dur; unclassifiedMin += dur; }
      } else if (seg.state === 'idle') {
        const cat = wordMappedCat(cls, 'idle');
        if (cat === 'notScheduled') buckets.notScheduled += dur;
        else if (cat) buckets.plannedStop += dur;
        else { buckets.unclassified += dur; unclassifiedMin += dur; }
      } else if (seg.state === 'changeover') {
        if (wordMappedCat(cls, 'changeover')) { buckets.changeover += dur; correctMin += dur; }
        else { buckets.unclassified += dur; unclassifiedMin += dur; }
      } else if (seg.state === 'blocked' || seg.state === 'starved') {
        if (wordMappedCat(cls, seg.state)) { buckets.blockedStarved += dur; correctMin += dur; }
        else { buckets.unclassified += dur; unclassifiedMin += dur; }
      } else if (seg.state === 'fault') {
        const cat = wordMappedCat(cls, 'fault');
        if (!cat) { buckets.unclassified += dur; unclassifiedMin += dur; }
        else {
          const trueCat = (seg.incidentId && INCIDENTS.find((i) => i.id === seg.incidentId)?.trueCategory) || 'unplannedStop';
          if (dur <= threshold) {
            buckets.shortStop += dur;
            if (trueCat === 'shortStop') correctMin += dur;
          } else {
            buckets.unplannedStop += dur;
            if (trueCat === 'unplannedStop') correctMin += dur;
          }
        }
      }
    }

    // The maker's fully-absorbed faults never stopped output — but they are
    // still true short stops the maker's own record should show. Count them
    // into accuracy only (they are the reservoir's dividend, not a loss).

    // Recorded production counters (packer prodCount drives cases).
    const pkRow = conn.grid.find((r) => L.packer && r.machineId === L.packer.id && r.signal === 'prodCount');
    const truthCases = L.runs.reduce((s, r) => s + r.qtyProduced, 0);
    const truthPacks = truthCases * PHYSICS.cartonsPerCase;
    let recordedPacks = null;
    if (pkRow?.status === 'ok') recordedPacks = truthPacks;
    else if (pkRow?.status === 'scaleError') recordedPacks = truthPacks * pkRow.factor;
    else if (pkRow?.status === 'crossSignal') recordedPacks = 0;
    const recordedCases = recordedPacks != null ? recordedPacks / PHYSICS.cartonsPerCase : null;

    // Recorded rejects (maker + packer counters) — visible only if mapped.
    const truthRejPacks = Math.round(truthPacks * PHYSICS.baseRejects.packer);
    const truthRejSticks = Math.round(truthPacks * PHYSICS.tabletsPerCarton * PHYSICS.baseRejects.maker);
    const rejRows = conn.grid.filter((r) =>
      ((L.maker && r.machineId === L.maker.id) || (L.packer && r.machineId === L.packer.id)) &&
      r.signal.startsWith('rej')
    );
    const rejVisible = rejRows.some((r) => r.status === 'ok');

    // OEE: base = shift − planned stops − not-scheduled time.
    const base = SHIFT.endMin - buckets.plannedStop - buckets.notScheduled - buckets.unclassified * 0;
    const losses = buckets.changeover + buckets.unplannedStop + buckets.shortStop + buckets.blockedStarved + buckets.unclassified + buckets.unaccounted;
    const availability = base > 0 ? Math.max(0, base - losses) / base : 0;
    const performance = productionMinRecorded > 0 && recordedCases != null && L.lineRate > 0
      ? recordedCases / (L.lineRate * productionMinRecorded)
      : null;
    const qualityRate = recordedCases != null && recordedCases > 0
      ? (rejVisible ? Math.max(0, 1 - (truthRejSticks / PHYSICS.tabletsPerCarton / PHYSICS.cartonsPerCase + truthRejPacks / PHYSICS.cartonsPerCase) / recordedCases) : 1)
      : null;
    // A counter that reads high cannot buy OEE: performance is capped at 1.0
    // in the product, and the line is marked untrusted so no view can quote
    // the number without the caveat.
    const oeeVal = performance != null && qualityRate != null
      ? availability * Math.min(performance, 1) * qualityRate
      : null;
    const trustIssues = [];
    if (performance != null && performance > 1.01) trustIssues.push('production counter reads above the machine\'s rated speed — check the register and scaling');
    if (!rejVisible) trustIssues.push('no reject counter is mapped — the Quality factor is an assumption, not a measurement');
    if (!stateMapped) trustIssues.push('no state word is mapped — Availability is guesswork');
    else if (buckets.unaccounted > 0) trustIssues.push(`${Math.round(buckets.unaccounted)} min of real stops were never seen by the sampling`);
    if (buckets.unclassified > 0) trustIssues.push(`${Math.round(buckets.unclassified)} min are unclassified`);

    perLine.push({
      lineCode: L.lineCode, lineIndex: L.lineIndex, buckets,
      availability, performance, quality: qualityRate, oee: oeeVal,
      recordedCases, truthCases, rejVisible, stateMapped,
      trusted: trustIssues.length === 0, trustIssues,
    });
  }

  const classificationAccuracy = trueStopMin > 0 ? Math.min(1, correctMin / trueStopMin) : 1;
  return { perLine, classificationAccuracy, unclassifiedMin, trueStopMin };
}

// ---------------------------------------------------------------------------
// Integration log: MES → APS actuals + MES → EU Hub (FMD upload / EPCIS events).
// ---------------------------------------------------------------------------
function deriveIntegrationLog(config, lineResults, trace, quality) {
  const fb = config.apsIntegration.actualsFeedback ?? {};
  const messages = [];

  for (const L of lineResults) {
    for (const r of L.runs) {
      if (fb.enabled) {
        const payload = {};
        for (const f of fb.fields ?? []) {
          if (f === 'actualStart') payload.actualStart = clockLabel(r.actualStart);
          if (f === 'actualEnd') payload.actualEnd = clockLabel(r.actualEnd);
          if (f === 'goodCases') payload.goodCases = r.qtyProduced;
          if (f === 'adherenceFlag') payload.adherenceFlag = Math.abs(r.slipMin) <= PHYSICS.adherenceToleranceMin ? 'ON-TIME' : 'LATE';
        }
        if (r.slipMin > num(fb.onDelayMin, 0) && num(fb.onDelayMin, 0) > 0) {
          messages.push({
            atMin: r.actualStart, system: 'APS', type: 'DELAY-NOTICE', runId: r.runId,
            status: 'sent', detail: `Start slipped ${r.slipMin} min — shifted completion sent to Cadence APS.`,
          });
        }
        messages.push({
          atMin: r.actualEnd, system: 'APS', type: 'RUN-ACTUALS', runId: r.runId,
          status: 'sent', detail: JSON.stringify(payload),
        });
      }
    }
  }

  // EU Hub (FMD) upload + EPCIS aggregation / shipping events.
  if (trace.repositoryEnabled) {
    for (const pr of trace.perRun) {
      const prodOk = pr.serialized;
      messages.push({
        atMin: 470, system: 'EU-HUB', type: 'SERIAL-UPLOAD', runId: pr.runId,
        status: prodOk ? 'sent' : 'failed',
        detail: prodOk
          ? `${pr.packs.toLocaleString()} carton UIs uploaded to the EU Hub (pool ${pr.rangeId}).`
          : `REJECTED — cartons without valid UIs cannot be uploaded; the batch cannot be QP-released.`,
      });
      const aggOk = pr.aggregation.carton && pr.aggregation.case && pr.aggregation.pallet;
      messages.push({
        atMin: 472, system: 'EU-HUB', type: 'AGGREGATION', runId: pr.runId,
        status: aggOk ? 'sent' : (trace.bufferAndRetry ? 'queued' : 'failed'),
        detail: aggOk
          ? `Full carton→bundle→case→pallet EPCIS aggregation tree sent.`
          : `${pr.aggregation.gaps.toLocaleString()} unresolvable parent-child links.`,
      });
      const dispatchOk = pr.serialized && pr.unverifiedShipped === 0;
      messages.push({
        atMin: 478, system: 'EU-HUB', type: 'SHIPPING', runId: pr.runId,
        status: dispatchOk ? 'sent' : 'failed',
        detail: dispatchOk
          ? `${pr.cases} cases to quarantine, shipping event staged for QP release.`
          : pr.unverifiedShipped > 0
            ? `REJECTED — ${pr.unverifiedShipped} unverified UIs in the consignment (they will fail verification at the pharmacy).`
            : `REJECTED — unserialized product in the consignment.`,
      });
    }
  }

  messages.sort((a, b) => a.atMin - b.atMin);
  return messages;
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------
function deriveKpis(config, bank, lineResults, quality, trace, oee, conn, integrationLog) {
  const allRuns = lineResults.flatMap((L) => L.runs);
  const plannedCases = allRuns.reduce((s, r) => s + r.qtyPlanned, 0);
  const producedCases = allRuns.reduce((s, r) => s + r.qtyProduced, 0);

  // Held: quality holds + (if the repository is on) unserialized production.
  let heldCases = quality.heldCases;
  if (trace.repositoryEnabled) {
    const unserializedCases = Math.round(trace.unserializedPacks / PHYSICS.cartonsPerCase);
    heldCases += unserializedCases;
  }
  heldCases = Math.min(heldCases, producedCases);
  const shippedCases = Math.max(0, producedCases - heldCases);

  const onTime = allRuns.filter((r) => Math.abs(r.slipMin) <= PHYSICS.adherenceToleranceMin && r.qtyProduced > 0).length;
  const startAdherence = allRuns.length > 0 ? onTime / allRuns.length : 0;
  const volumeAdherence = plannedCases > 0 ? producedCases / plannedCases : 0;
  const scheduleAdherence = startAdherence * Math.min(1, volumeAdherence);

  const changeoverActualMin = lineResults.reduce((s, L) => s + L.changeovers.reduce((x, c) => x + (c.netMin ?? (c.end - c.start)), 0), 0);

  const truthPacks = producedCases * PHYSICS.cartonsPerCase;
  const truthRejects = Math.round(truthPacks * PHYSICS.baseRejects.packer) + Math.round(truthPacks * PHYSICS.tabletsPerCarton * PHYSICS.baseRejects.maker) / PHYSICS.tabletsPerCarton;
  const fpyTruth = truthPacks > 0 ? Math.max(0, 1 - (truthRejects + trace.voidedPacks) / (truthPacks + truthRejects)) : 1;
  const anyRejVisible = oee.perLine.some((l) => l.rejVisible);
  const fpyRecorded = anyRejVisible ? fpyTruth : (truthPacks > 0 ? 1 : null);

  const oeeVals = oee.perLine.map((l) => l.oee).filter((v) => v != null);
  const availVals = oee.perLine.map((l) => l.availability).filter((v) => v != null);
  const perfVals = oee.perLine.map((l) => l.performance).filter((v) => v != null);

  const uiVerifyRate = trace.perRun.length > 0
    ? (() => {
        const printed = trace.perRun.reduce((s, p) => s + (p.serialized ? p.packs : 0), 0);
        const bad = trace.perRun.reduce((s, p) => s + p.unverifiedShipped, 0);
        return printed > 0 ? Math.max(0, 1 - bad / printed) : null;
      })()
    : null;

  const repoMsgs = integrationLog.filter((m) => m.system === 'EU-HUB');
  const apsMsgs = integrationLog.filter((m) => m.system === 'APS');

  // € loss ticker (training-grade economics, deliberately simple — PHYSICS.euro).
  const E = PHYSICS.euro ?? { caseNotShipped: 150, defectiveCaseShipped: 400, unserializedCarton: 0.5, repositoryFailure: 500 };
  const euroLoss =
    (plannedCases - shippedCases) * E.caseNotShipped +
    quality.shippedDefectiveCases * E.defectiveCaseShipped +
    Math.round(trace.unserializedPacks * E.unserializedCarton) +
    repoMsgs.filter((m) => m.status === 'failed').length * E.repositoryFailure;

  return {
    plannedCases, producedCases, shippedCases, heldCases,
    scheduleAdherence, startAdherence, volumeAdherence,
    changeoverActualMin,
    oee: oeeVals.length ? oeeVals.reduce((a, b) => a + b, 0) / oeeVals.length : null,
    oeeTrusted: oee.perLine.every((l) => l.trusted),
    oeeTrustIssues: [...new Set(oee.perLine.flatMap((l) => l.trustIssues))],
    availability: availVals.length ? availVals.reduce((a, b) => a + b, 0) / availVals.length : null,
    performance: perfVals.length ? perfVals.reduce((a, b) => a + b, 0) / perfVals.length : null,
    fpy: fpyRecorded, fpyTruth,
    uiVerifyRate,
    unserializedPacks: trace.unserializedPacks,
    unverifiedShippedPacks: trace.unverifiedShippedPacks,
    aggregationGaps: trace.aggregationGaps,
    genealogyGaps: trace.genealogyGaps,
    defectsCaught: quality.defectsCaught,
    defectsEscaped: quality.defectsEscaped,
    defectsShipped: quality.shippedDefectiveCases,
    classificationAccuracy: oee.classificationAccuracy,
    unclassifiedMin: oee.unclassifiedMin,
    dataFidelity: conn.dataFidelity,
    repositoryReported: repoMsgs.filter((m) => m.status === 'sent').length,
    repositoryQueued: repoMsgs.filter((m) => m.status === 'queued').length,
    repositoryFailed: repoMsgs.filter((m) => m.status === 'failed').length,
    apsFeedbackSent: apsMsgs.length,
    euroLoss,
  };
}
