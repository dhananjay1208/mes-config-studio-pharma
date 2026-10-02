import { buildModelAnswerConfig } from '../src/data/presets.js';
import { emptyConfig } from '../src/engine/defaults.js';
import { PHASES, checkPhase } from '../src/project/phases.js';

const model = buildModelAnswerConfig();
const empty = emptyConfig();

console.log('=== Model answer per phase ===');
let totalStars = 0;
for (const p of PHASES) {
  const r = checkPhase(model, p.id);
  totalStars += r.stars;
  console.log(`P${p.id} ${p.title}: ${r.passed ? 'PASS' : 'FAIL'} (${r.stars}★)`);
  for (const c of r.checks) if (!c.ok) console.log(`   ✗ ${c.label}`);
}
console.log('Total stars:', totalStars, '/ 30');

console.log('\n=== Empty config per phase (should fail broadly) ===');
for (const p of PHASES) {
  const r = checkPhase(empty, p.id);
  console.log(`P${p.id}: ${r.passed ? 'PASS?!' : 'fail'} (${r.stars}★)`);
}
