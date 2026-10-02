// The inbound APS schedule feed — sequenced production runs from Cadence APS
// (Northline Planning Systems), the customer's external finite scheduler.
// The MES RECEIVES this schedule; it never re-sequences. The trainee maps the
// interface, validates feasibility, gates release, and feeds actuals back.
//
// Deterministic and hand-tuned:
//  - Wednesday (the deploy day) carries 6 executable runs; the Cardexil EXPORT
//    rush call-off arrives LAST in the feed with a freeze override.
//  - 5 poisoned runs that the feasibility checks should catch (one on
//    Wednesday, four on the Thursday horizon — a good MES flags them BEFORE
//    anyone tries to run them).
//
// Timestamps are day-code + shift clock ('WED 06:00'); the shift runs
// 06:00–14:00, so WED 06:00 = deploy-day minute 0.

export const APS_FIELDS = [
  { field: 'SCHED_ID', desc: 'Schedule run identifier' },
  { field: 'ORDER_REF', desc: 'ERP process order reference' },
  { field: 'LINE_ID', desc: 'Target line code' },
  { field: 'SEQ_NO', desc: 'Sequence number on the line' },
  { field: 'START_TS', desc: 'Planned start (day + time)' },
  { field: 'END_TS', desc: 'Planned end (day + time)' },
  { field: 'QTY_CS', desc: 'Run quantity (cases)' },
  { field: 'CO_TYPE', desc: 'Changeover type the APS assumed' },
  { field: 'FREEZE_FLG', desc: 'Frozen-horizon flag' },
  { field: 'SCEN_ID', desc: 'Planning scenario id' },       // distractor
  { field: 'PLANNER', desc: 'Planner user id' },            // distractor
  { field: 'HORIZON_ID', desc: 'Planning horizon id' },     // distractor
];

export const MES_SCHEDULE_FIELDS = [
  { field: 'runId', desc: 'MES run identifier' },
  { field: 'orderNo', desc: 'Linked process order' },
  { field: 'lineCode', desc: 'Execution line' },
  { field: 'seq', desc: 'Sequence on the line' },
  { field: 'plannedStart', desc: 'Planned start' },
  { field: 'plannedEnd', desc: 'Planned end' },
  { field: 'qtyCases', desc: 'Quantity (cases)' },
];

export const CORRECT_APS_MAP = [
  { apsField: 'SCHED_ID', mesField: 'runId' },
  { apsField: 'ORDER_REF', mesField: 'orderNo' },
  { apsField: 'LINE_ID', mesField: 'lineCode' },
  { apsField: 'SEQ_NO', mesField: 'seq' },
  { apsField: 'START_TS', mesField: 'plannedStart' },
  { apsField: 'END_TS', mesField: 'plannedEnd' },
  { apsField: 'QTY_CS', mesField: 'qtyCases' },
];

export const DEPLOY_DAY = 'WED';

function rawRun(schedId, orderRef, line, seq, start, end, qty, coType, freeze = 'Y') {
  return {
    msgId: `APS-${schedId}`,
    raw: {
      SCHED_ID: `RUN-${schedId}`,
      ORDER_REF: orderRef,
      LINE_ID: line,
      SEQ_NO: seq,
      START_TS: start,
      END_TS: end,
      QTY_CS: qty,
      CO_TYPE: coType,
      FREEZE_FLG: freeze,
      SCEN_ID: 'S39-PROD',
      PLANNER: 'rmoreno',
      HORIZON_ID: 'H-2039',
    },
  };
}

export const SCHEDULE_FEED = [
  // ---- Wednesday, the deploy day -----------------------------------------
  rawRun(301, 'PO-77231', 'L3', 1, 'WED 06:00', 'WED 07:30', 90, 'NONE'),
  // Same tablet, same tooling — export artwork + vignette: a 20-min line clearance.
  rawRun(302, 'PO-77232', 'L3', 2, 'WED 07:50', 'WED 08:45', 40, 'MARKET'),
  // RUN-390 (the rush call-off) belongs at seq 3 — it arrives at the END of the feed.
  // POISON #5 — the planner pulled Thursday's Zentrix 50 mg forward onto
  // Line 3, mid-Wednesday. No potent IBC may dock on PR3 and Line 3 is not
  // segregated: accepted, this run starves to zero AND wrecks the afternoon.
  // siloRouting should catch it.
  rawRun(914, 'PO-77239', 'L3', 4, 'WED 10:30', 'WED 11:30', 60, 'PRODUCT'),
  // Femodyl mini-tablets after Cardexil is a TOOLING change (T11 → T4, ~3 h) —
  // Cadence planned the gap for it (incl. the lunch break).
  rawRun(303, 'PO-77233', 'L3', 5, 'WED 13:05', 'WED 13:45', 40, 'TOOLING'),
  rawRun(501, 'PO-77234', 'L5', 1, 'WED 06:00', 'WED 08:30', 150, 'CLEAN-NIGHT'),
  rawRun(502, 'PO-77235', 'L5', 2, 'WED 10:45', 'WED 12:50', 95, 'PRODUCT'),

  // ---- Thursday horizon (received now, validated now) ---------------------
  rawRun(304, 'PO-77237', 'L3', 1, 'THU 06:00', 'THU 08:40', 160, 'PRODUCT'),
  // POISON #1 — Zentrix on Line 3: no potent IBC may dock on PR3 and the line
  // is not potent-segregated. siloRouting should catch this.
  rawRun(909, 'PO-77239', 'L3', 2, 'THU 09:10', 'THU 10:50', 100, 'PRODUCT'),
  // POISON #2 — 240 cases of Cardexil 20 mg: with Thursday's other CDX-20 run
  // already committed, the CDX-20 IBC (200 kg released blend) goes negative.
  // blendAvailable should catch this.
  rawRun(910, 'PO-77238', 'L3', 3, 'THU 11:20', 'THU 15:20', 240, 'STRENGTH'),
  // POISON #3 — references PO-78899, an order ERP never sent. orderReleased
  // should catch this.
  rawRun(911, 'PO-78899', 'L3', 4, 'THU 15:40', 'THU 16:40', 60, 'NONE'),
  rawRun(913, 'PO-77239', 'L5', 1, 'THU 06:00', 'THU 07:40', 100, 'PRODUCT'),
  // POISON #4 — Cardexil 20 mg 30 minutes after a Zentrix run: the transition
  // needs the 360-min validated clean (+ swab + QA release). changeoverRules
  // should catch this.
  rawRun(912, 'PO-77240', 'L5', 2, 'THU 08:10', 'THU 10:30', 140, 'PRODUCT'),

  // ---- Friday horizon ------------------------------------------------------
  rawRun(305, 'PO-77241', 'L3', 1, 'FRI 06:00', 'FRI 07:00', 60, 'MARKET'),

  // ---- The rush call-off (arrives last, frozen-horizon override) ----------
  // A second Cardexil 10 mg EXPORT batch for the Italian wholesaler; Cadence
  // slotted it right after RUN-302 — same tablet, same tooling, same vignette,
  // only a 20-min line clearance and a new batch record. Feasible ONLY if the
  // trainee configured the EXP serial pool + export carton/leaflet/vignette
  // (the materialReadiness trap lives in a good-looking message).
  rawRun(390, 'PO-77236', 'L3', 3, 'WED 09:05', 'WED 09:35', 30, 'BATCH', 'OVERRIDE'),
];

/** 'WED 06:00' → { day: 'WED', min: minutes-from-shift-start } (shift = 06:00). */
export function tsToMin(ts) {
  if (typeof ts !== 'string' || !ts.includes(' ')) return { day: null, min: NaN };
  const [day, clock] = ts.split(' ');
  const [h, m] = clock.split(':').map(Number);
  return { day, min: (h - 6) * 60 + (m || 0) };
}

/** Apply the trainee's APS interface map to a raw schedule message. */
export function parseScheduleMsg(msg, interfaceMap) {
  const parsed = {};
  for (const row of interfaceMap) {
    if (!row.apsField || !row.mesField) continue;
    let v = msg.raw[row.apsField];
    if (row.mesField === 'qtyCases' || row.mesField === 'seq') v = Number(v);
    parsed[row.mesField] = v;
  }
  return parsed;
}
