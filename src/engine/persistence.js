const STATE_KEY = 'mes.configStudioPharma.v1.state';
export const SCHEMA_VERSION = 1;

let saveTimer = null;

export function loadWorkspace() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state?.meta || state.meta.schemaVersion !== SCHEMA_VERSION) return null;
    return state;
  } catch {
    return null;
  }
}

export function saveWorkspace(state) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {
      // Quota guard: drop the (largest) run results and retry once.
      try {
        const pruned = { ...state, lastRun: null };
        localStorage.setItem(STATE_KEY, JSON.stringify(pruned));
      } catch {
        /* give up silently — workshop app */
      }
    }
  }, 400);
}

export function clearWorkspace() {
  localStorage.removeItem(STATE_KEY);
}
