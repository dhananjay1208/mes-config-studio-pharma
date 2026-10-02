import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Module tab state that also honours ?tab=<id> deep links, so the coach and
 * acceptance hints can open a module on a specific tab. Depends on
 * location.key so re-clicking the same link still switches the tab back.
 */
export function useModuleTab(defaultTab) {
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get('tab');
  const [tab, setTab] = useState(requested ?? defaultTab);
  useEffect(() => {
    if (requested) setTab(requested);
  }, [requested, location.key]);
  return [tab, setTab];
}
