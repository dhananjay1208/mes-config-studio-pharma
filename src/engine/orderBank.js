// Derives the live order bank from the ERP feed + the trainee's Order
// Management configuration. Used by BOTH the Orders screen and the schedule
// engine, so what the trainee sees is exactly what the plant runs.
import { ORDER_FEED, parseOrder, checkOrder } from '../data/erpFeed.js';

const DAY_ORDER = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 7 };

/**
 * Returns entries: { msg, parsed, failures, decision, status } where status ∈
 * received | rejected | error | validated | released — and `released`: the
 * parsed orders the APS schedule may legitimately reference.
 */
export function deriveOrderBank(config) {
  const decisions = config.orders.decisions ?? {};
  const manualReleased = config.orders.manualReleased ?? [];
  const map = config.orders.interfaceMap ?? [];

  const entries = ORDER_FEED.map((msg) => {
    const parsed = parseOrder(msg, map);
    const failures = checkOrder(parsed, config);
    const decision = decisions[msg.msgId] ?? null;
    let status = 'received';
    if (decision === 'rejected') status = 'rejected';
    else if (decision === 'accepted') status = failures.length > 0 ? 'error' : 'validated';
    return { msg, parsed, failures, decision, status };
  });

  // Release set: validated orders, per release rule
  const validated = entries.filter((e) => e.status === 'validated').map((e) => e.parsed);
  let released;
  if (config.orders.releaseRule.mode === 'horizon') {
    const n = Math.max(0, config.orders.releaseRule.horizonOrders ?? 0);
    released = [...validated]
      .sort((a, b) => (DAY_ORDER[a.dueDate] ?? 9) - (DAY_ORDER[b.dueDate] ?? 9))
      .slice(0, n);
  } else {
    released = validated.filter((o) => manualReleased.includes(o.orderNo));
  }

  const releasedSet = new Set(released.map((o) => o.orderNo));
  for (const e of entries) {
    if (e.status === 'validated' && releasedSet.has(e.parsed.orderNo)) e.status = 'released';
  }

  return { entries, validated, released };
}

/** Interface-map completeness: which MES fields are still unmapped. */
export function unmappedMesFields(config, mesFields) {
  const mapped = new Set((config.orders.interfaceMap ?? []).map((r) => r.mesField).filter(Boolean));
  return mesFields.filter((f) => !mapped.has(f.field));
}
