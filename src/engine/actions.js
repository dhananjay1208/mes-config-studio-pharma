// Action creators — keep dispatch call-sites terse and typo-safe.

/** Deep-set a value in state.config. path is an array, e.g. ['connectivity','signalRules','flatline','enabled'] */
export const setConfig = (path, value) => ({ type: 'CONFIG_SET', path, value });

export const patchMeta = (patch) => ({ type: 'META_PATCH', patch });

export const patchUi = (patch) => ({ type: 'UI_PATCH', patch });

export const patchProject = (patch) => ({ type: 'PROJECT_PATCH', patch });

export const setMode = (mode) => ({ type: 'MODE_SET', mode });

export const importState = (state) => ({ type: 'IMPORT_STATE', state });

export const resetWorkspace = (mode) => ({ type: 'RESET_ALL', mode });

export const completeRun = (run) => ({ type: 'RUN_COMPLETE', run });
