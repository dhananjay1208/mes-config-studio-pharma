// The APS integration engine: derives the schedule bank from the Cadence APS
// feed + the trainee's APS Integration configuration. Powers BOTH the module's
// "Validate schedule" panel and the run engine — projection = reality.
//
// The MES never re-sequences. It parses what Cadence sent, evaluates
// feasibility with the trainee's enabled checks, gates release, and hands the
// deploy-day runs to execution exactly as accepted.
import { SCHEDULE_FEED, parseScheduleMsg, tsToMin, DEPLOY_DAY } from '../data/apsFeed.js';
import { PHYSICS, caseKg } from '../data/realityTape.js';
import { deriveOrderBank } from './orderBank.js';
import { linesOfPlant, silosFeedingLine } from './selectors.js';

const DAY_ORDER = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 7 };

// The changeover ladder keys on the PRODUCT FAMILY (API): a strength, market or
// batch change inside a family is the cheap line clearance; a change across
// families is a product change with a minor clean. SKUs without a family fall
// back to their blend code.
const familyOf = (sku) => sku.family ?? sku.blendCode;

/** Believed changeover minutes between two SKUs, from the trainee's model. */
export function believedChangeoverMin(changeoverModel, fromSku, toSku) {
  if (!fromSku || !toSku) return 0;
  const cm = changeoverModel ?? {};
  if (fromSku.potent && !toSku.potent) return cm.potentCleanMin ?? 0;
  if (fromSku.format !== toSku.format) return cm.formatChangeMin ?? 0;
  if (familyOf(fromSku) !== familyOf(toSku)) return cm.blendChangeMin ?? 0;
  return cm.sameBlendSameFormatMin ?? 0;
}

/** ACTUAL changeover minutes (tape physics) between two SKUs. */
export function actualChangeoverMin(fromSku, toSku) {
  if (!fromSku || !toSku) return 0;
  const cm = PHYSICS.changeoverMin;
  if (fromSku.potent && !toSku.potent) return cm.potentClean;
  if (fromSku.format !== toSku.format) return cm.formatChange;
  if (familyOf(fromSku) !== familyOf(toSku)) return cm.blendChange;
  return cm.sameBlendSameFormat;
}

/**
 * Evaluate one run against the enabled feasibility checks.
 * ctx: { releasedByOrderNo, skusByCode, lines, siloLedger, prevRunOnLine }
 * Returns findings: [{ checkId, level, msg }].
 */
export function evaluateRunFeasibility(config, run, ctx) {
  const checks = config.apsIntegration.feasibilityChecks ?? {};
  const findings = [];
  const sku = run.sku;

  if (checks.orderReleased) {
    if (!run.orderNo || !ctx.releasedByOrderNo.has(run.orderNo)) {
      findings.push({
        checkId: 'orderReleased', level: 'error',
        msg: `References ${run.orderNo || 'no order'}, which is not a released ERP order — running it would produce stock ERP knows nothing about.`,
      });
    }
  }

  if (checks.siloRouting && sku) {
    const line = ctx.lines.find((l) => l.line.code === run.lineCode);
    const feeding = silosFeedingLine(config, run.lineCode).filter((s) => s.props.blendCode === sku.blendCode);
    if (feeding.length === 0) {
      findings.push({
        checkId: 'siloRouting', level: 'error',
        msg: `No IBC holding ${sku.blendCode} may dock on ${run.lineCode}'s press — the press would starve from minute one.`,
      });
    }
    if (sku.potent && line && !line.line.props.potentCapable) {
      findings.push({
        checkId: 'siloRouting', level: 'error',
        msg: `${sku.code} is a potent product but ${run.lineCode} is not potent-segregated — running it cross-contaminates every product after it on that line (a written-off batch, not a deviation).`,
      });
    }
  }

  if (checks.blendAvailable && sku) {
    // The ledger is PER DAY — the granulation suite refills the IBC fleet overnight.
    const demandKg = (run.qtyCases ?? 0) * caseKg(sku);
    const feeding = silosFeedingLine(config, run.lineCode).filter((s) => s.props.blendCode === sku.blendCode);
    if (feeding.length > 0) {
      const available = feeding.reduce((sum, s) => sum + (s.props.startLevelKg ?? 0), 0);
      const key = (s) => `${run.day}:${s.id}`;
      const committed = feeding.reduce((sum, s) => sum + (ctx.siloLedger.get(key(s)) ?? 0), 0);
      if (committed + demandKg > available) {
        findings.push({
          checkId: 'blendAvailable', level: 'error',
          msg: `Needs ${Math.round(demandKg).toLocaleString()} kg of ${sku.blendCode} but only ${Math.max(0, Math.round(available - committed)).toLocaleString()} kg of released blend remain uncommitted in the IBCs that day — the run would empty the IBC mid-batch.`,
        });
      } else {
        // Commit the demand so later runs the same day see it.
        const s0 = feeding[0];
        ctx.siloLedger.set(key(s0), (ctx.siloLedger.get(key(s0)) ?? 0) + demandKg);
      }
    }
  }

  if (checks.changeoverRules && sku) {
    const prev = ctx.prevRunOnLine.get(`${run.day}:${run.lineCode}`);
    if (prev && prev.sku) {
      const gap = run.startMin - prev.endMin;
      const needed = believedChangeoverMin(config.apsIntegration.changeoverModel, prev.sku, sku);
      if (gap < needed) {
        findings.push({
          checkId: 'changeoverRules', level: 'error',
          msg: `Only ${Math.max(0, gap)} min planned after ${prev.sku.code}, but the ${prev.sku.potent && !sku.potent ? 'validated potent-product clean' : 'changeover'} needs ${needed} min — the whole day behind it will slip.`,
        });
      }
    }
  }

  if (checks.materialReadiness) {
    if (!sku) {
      // Only speak when the order is known but its SKU isn't configured;
      // an unknown order is the orderReleased check's finding, not ours.
      if (run.orderKnown) {
        findings.push({
          checkId: 'materialReadiness', level: 'error',
          msg: `The referenced SKU is not configured in Products & Materials — the run cannot be packed, vignetted or serialized.`,
        });
      }
    } else {
      const bom = config.materials.boms.find((b) => b.skuCode === sku.code);
      if (!bom || bom.lines.length === 0) {
        findings.push({
          checkId: 'materialReadiness', level: 'error',
          msg: `${sku.code} has no BOM — the packaging line would have no film, foil, cartons or leaflets to consume.`,
        });
      }
      if (sku.market === 'EXP') {
        const range = config.materials.uiRanges.find(
          (r) => r.market === 'EXP' && (r.assignedSkus || []).includes(sku.code)
        );
        if (!range) {
          findings.push({
            checkId: 'materialReadiness', level: 'error',
            msg: `${sku.code} is an export SKU with no EXP serial-number pool assigned — its cartons cannot be legally serialized.`,
          });
        }
      }
    }
  }

  return findings;
}

/**
 * The schedule bank. Returns:
 *  entries       — feed (arrival) order: { msg, parsed, run, findings, decision, status }
 *                  status ∈ received | rejected | infeasible | accepted | released
 *  dayRuns       — released deploy-day runs, chronological
 *  runsByLine    — { [lineCode]: [released deploy-day runs, chronological] }
 */
export function deriveScheduleBank(config) {
  const map = config.apsIntegration.interfaceMap ?? [];
  const decisions = config.apsIntegration.decisions ?? {};
  const gate = config.apsIntegration.releaseGate?.mode ?? 'autoAccept';

  const orderBank = deriveOrderBank(config);
  const releasedByOrderNo = new Map(orderBank.released.map((o) => [o.orderNo, o]));
  // The MES knows the SKU from ANY parsed order — released or not; release
  // state is the orderReleased check's business.
  const anyOrderByNo = new Map(
    orderBank.entries.filter((e) => e.parsed.orderNo).map((e) => [e.parsed.orderNo, e.parsed])
  );
  const skusByCode = new Map(config.materials.skus.map((s) => [s.code, s]));
  const lines = linesOfPlant(config);

  // Parse everything first.
  const entries = SCHEDULE_FEED.map((msg) => {
    const parsed = parseScheduleMsg(msg, map);
    const start = tsToMin(parsed.plannedStart ?? '');
    const end = tsToMin(parsed.plannedEnd ?? '');
    const order = parsed.orderNo ? anyOrderByNo.get(parsed.orderNo) : null;
    const skuCode = order?.skuCode ?? null;
    const run = {
      runId: parsed.runId ?? null,
      orderNo: parsed.orderNo ?? null,
      lineCode: parsed.lineCode ?? null,
      seq: parsed.seq ?? null,
      qtyCases: parsed.qtyCases ?? 0,
      day: start.day,
      startMin: start.min,
      endMin: end.min,
      skuCode,
      sku: skuCode ? (skusByCode.get(skuCode) ?? null) : null,
      orderKnown: Boolean(order),
      plannedStartTs: parsed.plannedStart ?? null,
      plannedEndTs: parsed.plannedEnd ?? null,
    };
    return { msg, parsed, run, findings: [], decision: decisions[msg.msgId] ?? null, status: 'received' };
  });

  // Mapping completeness — without runId/lineCode/plannedStart nothing can run.
  const mapIncomplete = entries.every((e) => !e.run.runId || !e.run.lineCode || !e.run.day);

  // Evaluate feasibility in CHRONOLOGICAL order so the silo ledger and the
  // previous-run-on-line context accumulate the way time does.
  const chronological = [...entries].sort((a, b) => {
    const d = (DAY_ORDER[a.run.day] ?? 9) - (DAY_ORDER[b.run.day] ?? 9);
    if (d !== 0) return d;
    if ((a.run.startMin ?? 0) !== (b.run.startMin ?? 0)) return (a.run.startMin ?? 0) - (b.run.startMin ?? 0);
    return (a.run.seq ?? 0) - (b.run.seq ?? 0);
  });

  const ctx = {
    releasedByOrderNo,
    skusByCode,
    lines,
    siloLedger: new Map(),
    prevRunOnLine: new Map(),
  };

  for (const e of chronological) {
    if (e.decision === 'rejected') { e.status = 'rejected'; continue; }
    if (!e.run.runId || !e.run.lineCode || !e.run.day) {
      e.findings.push({ checkId: 'mapping', level: 'error', msg: 'Message could not be parsed — the APS interface map is incomplete.' });
      e.status = 'received';
      continue;
    }
    e.findings.push(...evaluateRunFeasibility(config, e.run, ctx));
    const blocked = e.findings.length > 0 && gate === 'blockOnError';
    e.status = blocked ? 'infeasible' : 'accepted';
    if (e.status === 'accepted') {
      ctx.prevRunOnLine.set(`${e.run.day}:${e.run.lineCode}`, e.run);
    }
  }

  // Released = accepted runs on the deploy day.
  const dayEntries = chronological.filter((e) => e.status === 'accepted' && e.run.day === DEPLOY_DAY);
  for (const e of dayEntries) e.status = 'released';

  const dayRuns = dayEntries.map((e) => e.run);
  const runsByLine = {};
  for (const run of dayRuns) {
    (runsByLine[run.lineCode] ??= []).push(run);
  }
  for (const lineCode of Object.keys(runsByLine)) {
    runsByLine[lineCode].sort((a, b) => a.startMin - b.startMin);
  }

  return { entries, dayRuns, runsByLine, mapIncomplete, orderBank };
}

/** Which MES schedule fields are still unmapped. */
export function unmappedScheduleFields(config, scheduleFields) {
  const mapped = new Set((config.apsIntegration.interfaceMap ?? []).map((r) => r.mesField).filter(Boolean));
  return scheduleFields.filter((f) => !mapped.has(f.field));
}
