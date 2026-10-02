import React, { createContext, useContext, useEffect, useReducer } from 'react';
import { reducer } from './reducer.js';
import { createInitialState } from './defaults.js';
import { loadWorkspace, saveWorkspace } from './persistence.js';

const StateContext = createContext(null);
const DispatchContext = createContext(null);

export function StudioProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadWorkspace() ?? createInitialState());

  useEffect(() => {
    saveWorkspace(state);
  }, [state]);

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useStudio() {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error('useStudio must be used within StudioProvider');
  return ctx;
}

export function useStudioDispatch() {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error('useStudioDispatch must be used within StudioProvider');
  return ctx;
}
