import { buildModelAnswerConfig } from '../src/data/presets.js';
import { executeRun } from '../src/engine/execution.js';

const res = executeRun(buildModelAnswerConfig());
for (const r of res.connectivity.grid.filter((r) => r.signal === 'stateWord')) {
  console.log(r.machineCode, 'detected:', r.detectedStops, 'missed:', r.missedStops, 'status:', r.status);
}
console.log('\nL3 packer truth segs:');
for (const s of res.lines[1]?.truth?.packerSegs ?? []) console.log(' ', s.start, '-', s.end, s.state, s.reason ?? '', s.absorbed ? 'ABSORBED' : '');
console.log('\nlines order:', res.lines.map((l, i) => `${i}:${l.lineCode}`).join(', '));
