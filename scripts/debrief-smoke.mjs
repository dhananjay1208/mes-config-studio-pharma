// Headless "break one thing" debrief for the instructor: the model answer, then
// each debrief move from the README re-deployed — prints the KPI deltas.
import { buildModelAnswerConfig } from '../src/data/presets.js';
import { executeRun } from '../src/engine/execution.js';

const clone = (c) => JSON.parse(JSON.stringify(c));
const model = buildModelAnswerConfig();
const good = executeRun(model);
const pct = (v) => (v == null ? '—' : (v * 100).toFixed(1));
const show = (name, r) => console.log(
  name.padEnd(30),
  `produced ${r.kpis.producedCases}/${r.kpis.plannedCases}`,
  `shipped ${r.kpis.shippedCases}`, `held ${r.kpis.heldCases}`,
  `defShipped ${r.kpis.defectsShipped}`,
  `OEE ${pct(r.kpis.oee)}${r.kpis.oeeTrusted ? '' : '(untrusted)'}`,
  `FPY ${pct(r.kpis.fpy)}`, `fidelity ${pct(r.kpis.dataFidelity)}`,
  `unaccounted ${r.oee.perLine.map((l) => Math.round(l.buckets.unaccounted * 10) / 10).join('/')}`,
  `hubFail ${r.kpis.repositoryFailed}`, `€ ${r.kpis.euroLoss.toLocaleString()}`,
);

show('model answer', good);
let c = clone(model); c.connectivity.signalRules.flatline = { enabled: false, windowMin: 0 }; show('flatline OFF', executeRun(c));
c = clone(model); for (const t of c.connectivity.tagMap) if (t.signal === 'stateWord' && t.nodeId.includes('BL3')) t.pollMs = 30000; show('BL3 state word @ 30 s', executeRun(c));
c = clone(model); c.connectivity.tagMap = c.connectivity.tagMap.filter((t) => !(t.signal.startsWith('rej') && t.nodeId.includes('BL3'))); show('BL3 reject counters unmapped', executeRun(c));
c = clone(model); for (const t of c.connectivity.tagMap) if (t.nodeId === 'ns=2;s=PR3.Gauge.WeightMg') t.nodeId = 'ns=2;s=PR3.Gauge.WeightTmg'; show('PR3 weight → WeightTmg, scale 1', executeRun(c));
c = clone(model); for (const t of c.connectivity.tagMap) if (t.nodeId === 'ns=2;s=PR3.Prod.TabCount') t.nodeId = 'ns=2;s=PR3.Prod.TabCountK'; show('PR3 count → TabCountK, scale 1', executeRun(c));
c = clone(model); for (const t of c.connectivity.tagMap) if (t.nodeId === 'ns=2;s=BL3.Prod.BlisterCount') t.scale = 4; show('BL3 blister count ×4', executeRun(c));
c = clone(model); c.apsIntegration.purgeEnforcement.enabled = false; show('potent clean enforcement OFF', executeRun(c));
c = clone(model); c.apsIntegration.releaseGate.mode = 'autoAccept'; show('release gate auto-accept', executeRun(c));
c = clone(model); c.traceability.serialization.cameraVerify = false; show('camera verify OFF', executeRun(c));
c = clone(model); c.connectivity.signalRules.staleTimeoutSec = 0; show('stale timeout 0', executeRun(c));

console.log('\nSignal-quality events (model answer):');
for (const e of good.connectivity.signalEvents) console.log(`  ${e.clock} ${e.kind}: ${e.msg}`);
console.log('\nOEE buckets:');
for (const l of good.oee.perLine) console.log(`  ${l.lineCode}`, JSON.stringify(l.buckets));
console.log('\nExemplars:', good.trace.perRun[0].exemplarUi, '|', good.trace.perRun[0].exemplarSscc, '|', good.trace.perRun[0].blendLot);
