import { lazy } from 'react';
import {
  Network, Boxes, Inbox, CalendarClock, Cable, GitBranch, Activity, ShieldCheck,
} from 'lucide-react';

// The 8 configuration modules, in guided-project order. `phase` is the guided
// project phase that unlocks the module (Phase G wires the gating).
export const MODULES = [
  { id: 'plantModel',     title: 'Plant Modeler',          tagline: 'ISA-95 hierarchy, lines, coated-bulk holds & IBC supply', icon: Network,       phase: 1 },
  { id: 'materials',      title: 'Products & Materials',   tagline: 'SKUs, blends, BOMs, packaging & serial pools',           icon: Boxes,         phase: 2 },
  { id: 'orders',         title: 'Order Management',       tagline: 'ERP interface, order bank, release',                     icon: Inbox,         phase: 3 },
  { id: 'apsIntegration', title: 'APS Integration',        tagline: 'Receive & validate the Cadence APS schedule',            icon: CalendarClock, phase: 4 },
  { id: 'connectivity',   title: 'Shopfloor Connectivity', tagline: 'Machines, tags, sampling & signal quality',              icon: Cable,         phase: 5 },
  { id: 'traceability',   title: 'Track & Trace',          tagline: 'FMD UIs, aggregation, genealogy, EU Hub',                icon: GitBranch,     phase: 6 },
  { id: 'oee',            title: 'OEE & Downtime',         tagline: 'State model, state words, reasons, calendar',            icon: Activity,      phase: 7 },
  { id: 'quality',        title: 'Quality Manager',        tagline: 'Defects, inspection plans, containment',                 icon: ShieldCheck,   phase: 8 },
];

export const MODULE_COMPONENTS = {
  plantModel: lazy(() => import('./plantModel/index.jsx')),
  materials: lazy(() => import('./materials/index.jsx')),
  orders: lazy(() => import('./orders/index.jsx')),
  apsIntegration: lazy(() => import('./apsIntegration/index.jsx')),
  connectivity: lazy(() => import('./connectivity/index.jsx')),
  traceability: lazy(() => import('./traceability/index.jsx')),
  oee: lazy(() => import('./oee/index.jsx')),
  quality: lazy(() => import('./quality/index.jsx')),
};

export function moduleById(id) {
  return MODULES.find((m) => m.id === id) ?? null;
}
