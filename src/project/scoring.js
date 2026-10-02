import { PHASES } from './phases.js';

export function totalStars(project) {
  return Object.values(project.phases ?? {}).reduce((s, p) => s + (p.stars ?? 0), 0);
}

export function maxStars() {
  return PHASES.length * 3;
}

/** Go-live grade from the final acceptance checks + accumulated stars. */
export function gradeFor(goLiveChecks, project) {
  const ok = goLiveChecks.filter((c) => c.ok).length;
  const stars = totalStars(project);
  if (ok === goLiveChecks.length) return stars >= maxStars() - 3 ? 'A+' : 'A';
  if (ok >= goLiveChecks.length - 1) return 'B';
  if (ok >= goLiveChecks.length - 2) return 'C';
  return 'D';
}
