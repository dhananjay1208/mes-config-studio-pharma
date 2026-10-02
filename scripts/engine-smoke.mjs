// Headless engine smoke test for the pharma config studio.
import { buildModelAnswerConfig } from '../src/data/presets.js';
import { emptyConfig } from '../src/engine/defaults.js';
import { executeRun } from '../src/engine/execution.js';
import { deriveScheduleBank } from '../src/engine/scheduleCheck.js';
import { validateConfig, findingCounts } from '../src/engine/validate.js';

const model = buildModelAnswerConfig();

console.log('=== VALIDATION (model answer) ===');
const findings = validateConfig(model);
console.log(findingCounts(findings));
for (const f of findings) console.log(` [${f.level}] ${f.moduleId}: ${f.msg}`);

console.log('\n=== SCHEDULE BANK (model answer) ===');
const bank = deriveScheduleBank(model);
for (const e of bank.entries) {
  console.log(` ${e.msg.msgId} ${e.run.runId ?? 'â€”'} ${e.run.lineCode ?? 'â€”'} ${e.run.day ?? 'â€”'} q=${e.run.qtyCases} â†’ ${e.status}${e.findings.length ? ' | ' + e.findings.map((f) => f.checkId).join(',') : ''}`);
}
console.log('dayRuns:', bank.dayRuns.map((r) => `${r.runId}/${r.skuCode}@${r.lineCode}`).join(', '));

console.log('\n=== RUN (model answer) ===');
const res = executeRun(model);
console.log('KPIs:', JSON.stringify(res.kpis, null, 1));
console.log('\nRuns:');
for (const r of res.runs) {
  console.log(` ${r.runId} ${r.skuCode} ${r.lineCode}: planned ${r.qtyPlanned} produced ${r.qtyProduced}, start ${r.plannedStart}â†’${Math.round(r.actualStart)} (slip ${r.slipMin}), end ${Math.round(r.actualEnd)}`);
}
console.log('\nDefects:');
for (const d of res.quality.results) {
  console.log(` ${d.defectCode}: cases=${d.cases ?? 0} packs=${d.packs ?? 0} detected=${d.detected} by=${d.detectedBy ?? 'â€”'} held=${d.held ?? 0} shipped=${d.shipped ?? 0}`);
}
console.log('\nOEE per line:', res.oee.perLine.map((l) => `${l.lineCode}: A=${(l.availability * 100).toFixed(1)} P=${l.performance != null ? (l.performance * 100).toFixed(1) : 'â€”'} Q=${l.quality != null ? (l.quality * 100).toFixed(1) : 'â€”'} OEE=${l.oee != null ? (l.oee * 100).toFixed(1) : 'â€”'}`).join(' | '));
console.log('classificationAccuracy:', res.oee.classificationAccuracy.toFixed(3), 'unclassifiedMin:', res.oee.unclassifiedMin);
console.log('dataFidelity:', res.connectivity.dataFidelity.toFixed(3));
console.log('integration msgs:', res.integrationLog.length, 'repo failed:', res.kpis.repositoryFailed);

console.log('\n=== NAIVE (empty-ish config: model plant, everything else default) ===');
const naive = buildModelAnswerConfig();
naive.orders.validationChecks = { skuValid: false, uomIsCases: false, bomExists: false, uiRangeAssigned: false };
naive.apsIntegration.feasibilityChecks = { orderReleased: false, blendAvailable: false, siloRouting: false, changeoverRules: false, materialReadiness: false };
naive.apsIntegration.releaseGate = { mode: 'autoAccept' };
naive.apsIntegration.purgeEnforcement = { enabled: false };
naive.apsIntegration.actualsFeedback = { enabled: false, fields: [], onDelayMin: 0 };
naive.connectivity.tagMap = [];
naive.connectivity.signalRules = { staleTimeoutSec: 0, flatline: { enabled: false, windowMin: 0 } };
naive.oee.stateWordMap = {};
naive.oee.calendar.breaks = [];
naive.quality.inspectionPlans = [];
naive.quality.containment = [];
naive.traceability.serialization = { uiPrintMachineClass: null, cameraVerify: false, voidOnFail: false };
naive.traceability.aggregation = { levels: [] };
naive.traceability.repository = { enabled: false, partnerId: null, bufferAndRetry: false };
const nres = executeRun(naive);
console.log('Naive KPIs: shipped', nres.kpis.shippedCases, '/', nres.kpis.plannedCases,
  'adherence', nres.kpis.scheduleAdherence.toFixed(2),
  'defectsShipped', nres.kpis.defectsShipped,
  'dataFidelity', nres.kpis.dataFidelity.toFixed(2),
  'unclassified', Math.round(nres.kpis.unclassifiedMin));
for (const r of nres.runs) {
  console.log(` ${r.runId} ${r.skuCode ?? '?'} ${r.lineCode}: planned ${r.qtyPlanned} produced ${r.qtyProduced}, start ${r.plannedStart}â†’${Math.round(r.actualStart)}, end ${Math.round(r.actualEnd)}${r.starved ? ' STARVED' : ''}`);
}

console.log('\n=== EMPTY CONFIG validation ===');
const empty = emptyConfig();
console.log(findingCounts(validateConfig(empty)));

