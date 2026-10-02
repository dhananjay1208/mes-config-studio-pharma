import React, { useMemo, useState } from 'react';
import { Plug, Unplug, Wand2, AlertTriangle, Camera, ScanLine, Timer } from 'lucide-react';
import { useStudio, useStudioDispatch } from '../../engine/StudioContext.jsx';
import { setConfig } from '../../engine/actions.js';
import { useModuleTab } from '../../components/config/useModuleTab.js';
import { connectableMachines, nodeById } from '../../engine/selectors.js';
import { validateConnectivity } from '../../engine/validate.js';
import ThresholdSlider from '../../components/config/ThresholdSlider.jsx';
import TogglePanel from '../../components/config/TogglePanel.jsx';
import { SIGNAL_DICTIONARY, DEVICE_CATALOG } from '../../data/customer.js';

const TABS = [
  ['connections', 'Connections'],
  ['tagmap', 'Tag Mapping'],
  ['sampling', 'Sampling & Scaling'],
  ['quality', 'Signal Quality'],
];

const CLASS_LABEL = {
  maker: 'Tablet press', packer: 'Blister machine', cartoner: 'Cartoner + serialization', casePacker: 'Case packer',
  palletizer: 'Palletizer', reservoir: 'Coater + coated-bulk hold',
  dispensary: 'Dispensary', granulator: 'Granulator', dryer: 'Fluid-bed dryer', mill: 'Mill / sizer',
  blender: 'Blender', kitchen: 'Coating kitchen',
};

export default function ConnectivityModule() {
  const state = useStudio();
  const dispatch = useStudioDispatch();
  const [tab, setTab] = useModuleTab('connections');
  const findings = useMemo(() => validateConnectivity(state.config), [state.config]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === id ? 'bg-violet-600/20 text-violet-300' : 'text-slate-500 hover:bg-plant-800 hover:text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'connections' && <ConnectionsTab state={state} dispatch={dispatch} />}
      {tab === 'tagmap' && <TagMapTab state={state} dispatch={dispatch} />}
      {tab === 'sampling' && <SamplingTab state={state} dispatch={dispatch} />}
      {tab === 'quality' && <SignalQualityTab state={state} dispatch={dispatch} />}

      <div className="panel p-4">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="panel-title !text-slate-300">Configuration checks ({findings.length})</span>
        </div>
        {findings.length === 0 ? (
          <p className="text-xs text-emerald-400">Every machine is connected, every required signal mapped to the right register at the right scale.</p>
        ) : (
          <ul className="space-y-1.5">
            {findings.map((f) => (
              <li key={f.id} className={`text-[11px] leading-snug ${f.level === 'error' ? 'text-red-400/90' : 'text-amber-400/90'}`}>• {f.msg}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ConnectionsTab({ state, dispatch }) {
  const machines = connectableMachines(state.config);
  const conns = state.config.connectivity.connections;
  const commit = (next) => dispatch(setConfig(['connectivity', 'connections'], next));

  const isConnected = (m) => conns.some((c) => c.machineId === m.id && c.enabled !== false);
  const connect = (m) => {
    const cat = DEVICE_CATALOG[m.code];
    commit([
      ...conns.filter((c) => c.machineId !== m.id),
      { id: `CONN-${m.code}`, machineId: m.id, kind: cat?.kind ?? 'opcua', endpoint: cat?.endpoint ?? '', enabled: true },
    ]);
  };
  const disconnect = (m) => commit(conns.filter((c) => c.machineId !== m.id));
  const connectAll = () => {
    const next = [...conns];
    for (const m of machines) {
      if (!next.some((c) => c.machineId === m.id)) {
        const cat = DEVICE_CATALOG[m.code];
        next.push({ id: `CONN-${m.code}`, machineId: m.id, kind: cat?.kind ?? 'opcua', endpoint: cat?.endpoint ?? '', enabled: true });
      }
    }
    commit(next);
  };

  return (
    <div className="panel space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="pr-4 text-xs text-slate-500">
          A machine without a connection does not exist to the MES — no counts, no states, no rejects.
          Endpoints come from the plant device inventory (OPC UA on each controller, the checkweigher on Modbus TCP,
          the serialization cameras via the edge gateway EG-PKG-01); connect each controller, then map its tags.
        </p>
        <button className="btn-ghost shrink-0 !py-1.5 text-xs" onClick={connectAll} disabled={machines.length === 0}>
          <Plug className="h-3.5 w-3.5" /> Connect all machines
        </button>
      </div>

      {machines.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-600">No machines modeled yet — build the plant in Plant Modeler first.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700/70">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700/70 bg-plant-900">
                <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Machine</th>
                <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Class</th>
                <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Endpoint</th>
                <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Side devices</th>
                <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                <th className="w-32" />
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => {
                const cat = DEVICE_CATALOG[m.code];
                const on = isConnected(m);
                return (
                  <tr key={m.id} className="border-b border-slate-800/60 last:border-0 hover:bg-plant-900/50">
                    <td className="px-3 py-2">
                      <span className="mono text-slate-200">{m.code}</span>
                      <span className="ml-2 text-xs text-slate-500">{m.name}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">{CLASS_LABEL[m.props.machineClass] ?? m.props.machineClass}</td>
                    <td className="px-3 py-2">
                      {cat ? (
                        <span className="mono text-[11px] text-slate-400">{cat.endpoint}</span>
                      ) : (
                        <span className="text-[11px] text-amber-400">— not in device catalog —</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(cat?.devices ?? []).map((d) => (
                          <span key={d.id} className="chip bg-plant-800 !px-2 !py-0.5 normal-case tracking-normal text-slate-400" title={d.desc}>
                            {d.kind === 'camera' ? <Camera className="h-3 w-3" /> : <ScanLine className="h-3 w-3" />}
                            <span className="ml-1 mono text-[10px]">{d.id}</span>
                          </span>
                        ))}
                        {(cat?.devices ?? []).length === 0 && <span className="text-[11px] text-slate-700">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {on ? (
                        <span className="chip bg-emerald-900/60 !px-2 !py-0.5 text-emerald-300">Connected</span>
                      ) : (
                        <span className="chip bg-red-900/50 !px-2 !py-0.5 text-red-300">Not connected</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {on ? (
                        <button className="btn-ghost !px-2 !py-1 text-[11px]" onClick={() => disconnect(m)}>
                          <Unplug className="h-3 w-3" /> Disconnect
                        </button>
                      ) : (
                        <button className="btn-ghost !px-2 !py-1 text-[11px]" onClick={() => connect(m)} disabled={!cat}>
                          <Plug className="h-3 w-3" /> Connect
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function TagMapTab({ state, dispatch }) {
  const conns = state.config.connectivity.connections;
  const tags = state.config.connectivity.tagMap;
  const machines = connectableMachines(state.config).filter((m) =>
    conns.some((c) => c.machineId === m.id && c.enabled !== false));
  const [selId, setSelId] = useState(null);
  const sel = machines.find((m) => m.id === selId) ?? machines[0] ?? null;

  const commit = (next) => dispatch(setConfig(['connectivity', 'tagMap'], next));
  const tagFor = (signal) => tags.find((t) => t.machineId === sel.id && t.signal === signal);

  if (machines.length === 0) {
    return (
      <div className="panel p-4">
        <p className="py-6 text-center text-xs text-slate-600">No connected machines — connect a controller on the Connections tab first.</p>
      </div>
    );
  }

  const cat = DEVICE_CATALOG[sel.code];
  const dict = SIGNAL_DICTIONARY[sel.props.machineClass] ?? [];

  const setNode = (req, nodeId) => {
    const existing = tagFor(req.signal);
    if (!nodeId) {
      if (existing) commit(tags.filter((t) => t !== existing));
      return;
    }
    if (existing) commit(tags.map((t) => (t === existing ? { ...t, nodeId } : t)));
    else commit([...tags, { id: `TAG-${sel.code}-${req.signal}`, machineId: sel.id, signal: req.signal, nodeId, scale: 1, uom: req.uom, pollMs: 1000 }]);
  };
  const patchTag = (req, patch) => {
    const existing = tagFor(req.signal);
    if (existing) commit(tags.map((t) => (t === existing ? { ...t, ...patch } : t)));
  };
  const autoMap = () => {
    if (!cat) return;
    const next = tags.filter((t) => t.machineId !== sel.id);
    for (const req of dict) {
      const node = cat.nodes.find((n) => n.signal === req.signal && n.unitScale === 1)
        ?? cat.nodes.find((n) => n.signal === req.signal);
      if (!node) continue;
      next.push({ id: `TAG-${sel.code}-${req.signal}`, machineId: sel.id, signal: req.signal, nodeId: node.nodeId, scale: node.unitScale, uom: req.uom, pollMs: 1000 });
    }
    commit(next);
  };

  const statusFor = (req) => {
    const t = tagFor(req.signal);
    if (!t) return { label: 'Not mapped', cls: 'bg-slate-800 text-slate-500' };
    const node = cat?.nodes.find((n) => n.nodeId === t.nodeId);
    if (!node) return { label: 'Bad node', cls: 'bg-red-900/60 text-red-300' };
    if (node.signal !== req.signal) return { label: 'Wrong register?', cls: 'bg-amber-900/60 text-amber-300' };
    if (Math.abs((t.scale ?? 1) / node.unitScale - 1) > 1e-9) return { label: 'Scale?', cls: 'bg-amber-900/60 text-amber-300' };
    return { label: 'Mapped', cls: 'bg-emerald-900/60 text-emerald-300' };
  };

  return (
    <div className="panel space-y-4 p-4">
      <p className="text-xs text-slate-500">
        The worksheet: every signal the MES needs (left) against what this controller actually offers (the
        node picker). The picker lists REAL registers — including the wrong ones. The legacy TabCountK counter
        records 1 where 1,000 tablets passed; the WeightTmg register is in tenths of a milligram (2,500 = 250.0 mg).
        The MES will faithfully record whatever you bind.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {machines.map((m) => (
          <button key={m.id} onClick={() => setSelId(m.id)}
            className={`chip !px-2 !py-1 normal-case tracking-normal ${sel.id === m.id ? 'bg-violet-600/25 text-violet-200 ring-1 ring-violet-500' : 'bg-plant-800 text-slate-500 hover:text-slate-300'}`}>
            {m.code}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-slate-700/70 bg-plant-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-bold text-white">{sel.code} — {sel.name} <span className="ml-1 text-xs font-normal text-slate-500">({CLASS_LABEL[sel.props.machineClass] ?? sel.props.machineClass})</span></span>
          <button className="btn-ghost !py-1 text-xs" onClick={autoMap} disabled={!cat}>
            <Wand2 className="h-3.5 w-3.5" /> Auto-map this machine
          </button>
        </div>

        {!cat ? (
          <p className="py-4 text-center text-xs text-amber-400">{sel.code} is not in the plant device catalog — there is no address space to map against.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-700/70">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700/70 bg-plant-950/60">
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Required signal</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500" style={{ width: 70 }}>UoM</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Bound node</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500" style={{ width: 80 }}>Scale</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500" style={{ width: 90 }}>Poll (ms)</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500" style={{ width: 110 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {dict.map((req) => {
                  const t = tagFor(req.signal);
                  const st = statusFor(req);
                  return (
                    <tr key={req.signal} className="border-b border-slate-800/60 last:border-0 hover:bg-plant-950/40">
                      <td className="px-3 py-1.5">
                        <span className="text-slate-200">{req.label}</span>
                        {req.critical && <span className="ml-1.5 align-middle text-[9px] text-red-400" title="Critical signal">●</span>}
                      </td>
                      <td className="px-3 py-1.5"><span className="mono text-xs text-slate-500">{req.uom}</span></td>
                      <td className="px-2 py-1.5">
                        <select
                          className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-xs text-slate-200 outline-none hover:border-slate-600 focus:border-violet-500"
                          value={t?.nodeId ?? ''}
                          onChange={(e) => setNode(req, e.target.value)}
                        >
                          <option value="" className="bg-plant-900">— not mapped —</option>
                          {cat.nodes.map((n) => (
                            <option key={n.nodeId} value={n.nodeId} className="bg-plant-900">{n.nodeId} — {n.desc}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" disabled={!t}
                          className="mono w-16 rounded border border-transparent bg-transparent px-1 py-1 text-sm text-slate-200 outline-none hover:border-slate-600 focus:border-violet-500 disabled:text-slate-700"
                          value={t?.scale ?? ''}
                          placeholder="—"
                          onChange={(e) => patchTag(req, { scale: Number(e.target.value) })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" disabled={!t}
                          className="mono w-20 rounded border border-transparent bg-transparent px-1 py-1 text-sm text-slate-200 outline-none hover:border-slate-600 focus:border-violet-500 disabled:text-slate-700"
                          value={t?.pollMs ?? ''}
                          placeholder="—"
                          onChange={(e) => patchTag(req, { pollMs: Number(e.target.value) })}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`chip !px-2 !py-0.5 ${st.cls}`}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          <span className="text-red-400">●</span> = critical signal. An amber status is a question, not a
          blocker — the platform lets you deploy a wrong register. The run will show you what that costs.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function SamplingTab({ state, dispatch }) {
  const nodes = state.config.plantModel.nodes;
  const tags = state.config.connectivity.tagMap;
  const commit = (next) => dispatch(setConfig(['connectivity', 'tagMap'], next));
  const patch = (id, key, value) => commit(tags.map((t) => (t.id === id ? { ...t, [key]: value } : t)));
  const [demoPoll, setDemoPoll] = useState(1000);

  const rows = tags.map((t) => {
    const m = nodeById(nodes, t.machineId);
    const dict = SIGNAL_DICTIONARY[m?.props?.machineClass] ?? [];
    const req = dict.find((d) => d.signal === t.signal);
    return { tag: t, machine: m, label: req?.label ?? t.signal };
  });

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="panel-title mb-3">Why the poll period matters</div>
        <ThresholdSlider
          label="If every counter were polled this often" value={demoPoll}
          min={500} max={30000} step={500} unit="ms"
          onChange={setDemoPoll}
          example={
            demoPoll <= 2500
              ? `A stop shorter than ~${((demoPoll * 2) / 1000).toFixed(0)} s is invisible at this rate — the 6–9 s foil-splice stops are still captured as stops.`
              : demoPoll <= 4500
                ? `A stop shorter than ~${((demoPoll * 2) / 1000).toFixed(0)} s is invisible — a 6-second splice is already gone; only the 9-second ones survive.`
                : `A stop shorter than ~${((demoPoll * 2) / 1000).toFixed(0)} s is invisible — every 6–9 s foil splice vanishes between two samples, and OEE shows a mysteriously slow line instead of a stopping one.`
          }
        />
        <p className="mt-3 text-[11px] text-slate-500">
          Rule of thumb: a stop shorter than 2× the poll period is invisible. This slider changes nothing —
          the real poll periods are in the table below, per tag.
        </p>
      </div>

      <div className="panel p-4">
        <div className="panel-title mb-3">All mapped tags ({rows.length})</div>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-600">No tags mapped yet — start on the Tag Mapping tab.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-700/70">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700/70 bg-plant-900">
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Machine</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Signal</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Node</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500" style={{ width: 80 }}>Scale</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500" style={{ width: 100 }}>Poll (ms)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ tag, machine, label }) => {
                  const slow = (tag.pollMs ?? 1000) > 3000;
                  return (
                    <tr key={tag.id} className={`border-b border-slate-800/60 last:border-0 ${slow ? 'bg-amber-950/30' : 'hover:bg-plant-900/50'}`}>
                      <td className="px-3 py-1.5"><span className="mono text-slate-300">{machine?.code ?? '?'}</span></td>
                      <td className="px-3 py-1.5 text-xs text-slate-300">{label}</td>
                      <td className="px-3 py-1.5"><span className="mono text-[11px] text-slate-500">{tag.nodeId}</span></td>
                      <td className="px-2 py-1.5">
                        <input type="number"
                          className="mono w-16 rounded border border-transparent bg-transparent px-1 py-1 text-sm text-slate-200 outline-none hover:border-slate-600 focus:border-violet-500"
                          value={tag.scale ?? 1}
                          onChange={(e) => patch(tag.id, 'scale', Number(e.target.value))}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number"
                          className={`mono w-20 rounded border border-transparent bg-transparent px-1 py-1 text-sm outline-none hover:border-slate-600 focus:border-violet-500 ${slow ? 'text-amber-300' : 'text-slate-200'}`}
                          value={tag.pollMs ?? 1000}
                          onChange={(e) => patch(tag.id, 'pollMs', Number(e.target.value))}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Timer className="h-3 w-3 text-amber-400" /> Amber rows poll slower than 3 s — counters and state
          words at that rate will miss the 6–9 s foil splices that make up most of a blister line's lost time.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function SignalQualityTab({ state, dispatch }) {
  const rules = state.config.connectivity.signalRules;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="panel p-4">
        <div className="panel-title mb-2">Stale-data timeout</div>
        <div className="flex items-center gap-3">
          <input type="number" min={0}
            className="input mono !w-28"
            value={rules.staleTimeoutSec ?? 0}
            onChange={(e) => dispatch(setConfig(['connectivity', 'signalRules', 'staleTimeoutSec'], Number(e.target.value)))}
          />
          <span className="text-xs text-slate-400">seconds without an update before a tag is marked bad</span>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          {rules.staleTimeoutSec > 0
            ? `A controller that goes quiet for ${rules.staleTimeoutSec} s is flagged instead of trusted — its last state word stops masquerading as live truth.`
            : 'Zero = no stale detection. When a controller drops offline mid-shift, its last state word ("running") is trusted forever — the line can be down for an hour while the MES reports a perfect run.'}
        </p>
      </div>

      <TogglePanel
        title="Flatline detection (frozen probes)"
        description="A live process signal always breathes — flag any analog frozen to the decimal for N minutes."
        enabled={rules.flatline?.enabled ?? false}
        onToggle={(v) => dispatch(setConfig(['connectivity', 'signalRules', 'flatline', 'enabled'], v))}
      >
        <div className="flex items-center gap-3">
          <input type="number" min={0}
            className="input mono !w-28"
            value={rules.flatline?.windowMin ?? 0}
            onChange={(e) => dispatch(setConfig(['connectivity', 'signalRules', 'flatline', 'windowMin'], Number(e.target.value)))}
          />
          <span className="text-xs text-slate-400">minutes frozen to the decimal before the signal is flagged</span>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Without this, the frozen NIR probe on FBD2 feeds the control room a comfortable 2.1 % LOD all morning
          while the real granulate drifts out of the 1.5–2.5 % window and a wet sub-lot heads for the press — the
          most expensive kind of good news.
        </p>
      </TogglePanel>
    </div>
  );
}
