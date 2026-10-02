import { createInitialState } from './defaults.js';

// Immutable deep set along a path array. Arrays stay arrays.
function deepSet(obj, path, value) {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const copy = Array.isArray(obj) ? obj.slice() : { ...obj };
  copy[head] = deepSet(obj?.[head] ?? {}, rest, value);
  return copy;
}

export function reducer(state, action) {
  switch (action.type) {
    case 'CONFIG_SET':
      return {
        ...state,
        config: deepSet(state.config, action.path, action.value),
        meta: { ...state.meta, updatedAt: Date.now() },
      };

    case 'META_PATCH':
      return { ...state, meta: { ...state.meta, ...action.patch, updatedAt: Date.now() } };

    case 'UI_PATCH':
      return { ...state, ui: { ...state.ui, ...action.patch } };

    case 'PROJECT_PATCH':
      return { ...state, project: { ...state.project, ...action.patch } };

    case 'MODE_SET':
      return { ...state, meta: { ...state.meta, mode: action.mode, updatedAt: Date.now() } };

    case 'RUN_COMPLETE':
      return { ...state, lastRun: action.run };

    case 'IMPORT_STATE':
      // Caller is responsible for schema validation (see ExportImport screen).
      return action.state;

    case 'RESET_ALL':
      return createInitialState(action.mode ?? state.meta.mode);

    default:
      return state;
  }
}
