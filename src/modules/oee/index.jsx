import React, { useMemo, useState } from 'react';
import { Plus, Trash2, AlertTriangle, Wand2, Copy } from 'lucide-react';
import { useStudio, useStudioDispatch } from '../../engine/StudioContext.jsx';
import { setConfig } from '../../engine/actions.js';
import { useModuleTab } from '../../components/config/useModuleTab.js';
import { validateOee } from '../../engine/validate.js';
import EditableTable from '../../components/config/EditableTable.jsx';
import ThresholdSlider from '../../components/config/ThresholdSlider.jsx';
import { STATE_WORD_VALUES } from '../../data/customer.js';

const TABS = [
  ['states', 'State Model'],
  ['words', 'State-Word Mapping'],
  ['reasons', 'Reason Tree'],
  ['calendar', 'Calendar & Thresholds'],
];

const CATEGORY_OPTIONS = [
  { value: 'production', label: 'Production (runs the counter)' },
  { value: 'plannedStop', label: 'Planned stop (excluded from availability)' },
  { value: 'unplannedStop', label: 'Unplanned stop (availability loss)' },
  { value: 'shortStop', label: 'Short stop (performance loss)' },
  { value: 'notScheduled', label: 'Not scheduled (outside planned time)' },
];

const CATEGORY_COLOR = {
  production: 'text-emerald-400', plannedStop: 'text-sky-400',
  unplannedStop: 'text-red-400', shortStop: 'text-amber-400', notScheduled: 'text-slate-500',
};

const MACHINE_CLASSES = [
  ['maker', 'Tablet press'],
  ['packer', 'Blister machine'],
  ['cartoner', 'Cartoner'],
  ['casePacker', 'Case packer'],
  ['palletizer', 'Palletizer'],
  ['reservoir', 'Coater + hold'],
  ['dispensary', 'Dispensary'],
  ['granulator', 'Granulator'],
  ['dryer', 'Dryer'],
  ['mill', 'Mill'],
  ['blender', 'Blender'],
  ['kitchen', 'Coating kitchen'],
];

const STANDARD_STATES = [
  { id: 'ST-RUN', name: 'Running', category: 'production' },
  { id: 'ST-STARVED', name: 'Starved', category: 'unplannedStop' },
  { id: 'ST-BLOCKED', name: 'Blocked', category: 'unplannedStop' },
  { id: 'ST-FAULT', name: 'Breakdown', category: 'unplannedStop' },
  { id: 'ST-CO', name: 'Changeover / line clearance', category: 'plannedStop' },
  { id: 'ST-IDLE', name: 'Idle / no order', category: 'notScheduled' },
];

export default function OeeModule() {
  const state = useStudio();
  const dispatch = useStudioDispatch();
  const [tab, setTab] = useModuleTab('states');
  const findings = useMemo(() => validateOee(state.config), [state.config]);
  const oee = state.config.oee;

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

      {tab === 'states' && (
        <div className="panel space-y-3 p-4">
          <div className="flex items-start justify-between gap-4">
            <p className="text-xs text-slate-500">
              Every machine state maps to an OEE bucket. Whatever the model cannot classify lands in
              "Unclassified" — and unclassified time is availability loss nobody can explain in the morning meeting.
            </p>
            <button className="btn-ghost shrink-0 !py-1.5 text-xs"
              onClick={() => dispatch(setConfig(['oee', 'stateModel'], STANDARD_STATES.map((s) => ({ ...s }))))}>
              <Wand2 className="h-3.5 w-3.5" /> Seed standard 6-state model
            </button>
          </div>
          <EditableTable
            columns={[
              { key: 'id', label: 'ID', type: 'readonly', mono: true, width: 120 },
              { key: 'name', label: 'State', type: 'text' },
              { key: 'category', label: 'OEE bucket', type: 'select', options: CATEGORY_OPTIONS },
              { key: '_preview', label: '', type: 'readonly', width: 40,
                render: (row) => <span className={`text-lg leading-none ${CATEGORY_COLOR[row.category] ?? 'text-slate-600'}`}>●</span> },
            ]}
            rows={oee.stateModel}
            onChange={(i, key, value) => dispatch(setConfig(['oee', 'stateModel'],
              oee.stateModel.map((s, idx) => (idx === i ? { ...s, [key]: value } : s))))}
            onAdd={() => dispatch(setConfig(['oee', 'stateModel'],
              [...oee.stateModel, { id: `ST-${oee.stateModel.length + 1}`, name: '', category: 'unplannedStop' }]))}
            onDelete={(i) => dispatch(setConfig(['oee', 'stateModel'], oee.stateModel.filter((_, idx) => idx !== i)))}
            addLabel="Add state"
            emptyText="No states — the equipment can only ever be 'unknown'."
          />
        </div>
      )}

      {tab === 'words' && <StateWordTab oee={oee} dispatch={dispatch} />}

      {tab === 'reasons' && <ReasonTree oee={oee} dispatch={dispatch} />}

      {tab === 'calendar' && <CalendarTab oee={oee} dispatch={dispatch} />}

      <div className="panel p-4">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="panel-title !text-slate-300">Configuration checks ({findings.length})</span>
        </div>
        {findings.length === 0 ? (
          <p className="text-xs text-emerald-400">The state model can classify every minute this plant will throw at it.</p>
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
function StateWordTab({ oee, dispatch }) {
  const [cls, setCls] = useState('maker');
  const wordMap = oee.stateWordMap ?? {};
  const current = wordMap[cls] ?? {};

  const setWord = (word, stateId) => {
    const next = { ...current };
    if (stateId) next[word] = stateId;
    else delete next[word];
    dispatch(setConfig(['oee', 'stateWordMap', cls], next));
  };
  const copyToAll = () => {
    const next = { ...wordMap };
    for (const [c] of MACHINE_CLASSES) next[c] = { ...current };
    dispatch(setConfig(['oee', 'stateWordMap'], next));
  };

  const mappedCount = (c) => Object.keys(wordMap[c] ?? {}).length;

  return (
    <div className="panel space-y-4 p-4">
      <p className="text-xs text-slate-500">
        The controller does not speak OEE — it publishes an integer. This is where the raw state word becomes
        a bucket. An unmapped word lands in "Unclassified", and the downtime Pareto becomes one grey bar.
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {MACHINE_CLASSES.map(([c, label]) => (
          <button key={c} onClick={() => setCls(c)}
            className={`chip !px-2 !py-1 normal-case tracking-normal ${cls === c ? 'bg-violet-600/25 text-violet-200 ring-1 ring-violet-500' : 'bg-plant-800 text-slate-500 hover:text-slate-300'}`}>
            {label}
            <span className="ml-1.5 mono text-[10px] text-slate-500">{mappedCount(c)}/6</span>
          </button>
        ))}
        <button className="btn-ghost ml-auto !py-1 text-xs" onClick={copyToAll} disabled={Object.keys(current).length === 0}>
          <Copy className="h-3.5 w-3.5" /> Copy to all classes
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-700/70">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700/70 bg-plant-900">
              <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500" style={{ width: 90 }}>Raw word</th>
              <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Controller manual says</th>
              <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Equipment state</th>
              <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500" style={{ width: 160 }}>OEE bucket</th>
            </tr>
          </thead>
          <tbody>
            {STATE_WORD_VALUES.map((w) => {
              const stateId = current[w.word] ?? '';
              const st = oee.stateModel.find((s) => s.id === stateId);
              return (
                <tr key={w.word} className="border-b border-slate-800/60 last:border-0 hover:bg-plant-900/50">
                  <td className="px-3 py-1.5"><span className="mono text-slate-200">{w.word}</span></td>
                  <td className="px-3 py-1.5"><span className="mono text-xs text-slate-500">{w.meaning}</span></td>
                  <td className="px-2 py-1.5">
                    <select
                      className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm text-slate-200 outline-none hover:border-slate-600 focus:border-violet-500"
                      value={stateId}
                      onChange={(e) => setWord(w.word, e.target.value)}
                    >
                      <option value="" className="bg-plant-900">— unclassified —</option>
                      {oee.stateModel.map((s) => (
                        <option key={s.id} value={s.id} className="bg-plant-900">{s.name || s.id}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    {st ? (
                      <span className={`text-xs ${CATEGORY_COLOR[st.category] ?? 'text-slate-500'}`}>{st.category}</span>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {oee.stateModel.length === 0 && (
        <p className="text-xs text-amber-400">No states defined yet — seed the state model first, there is nothing to map words onto.</p>
      )}
      <p className="text-[11px] text-slate-500">
        The words are identical across this plant's controllers (1 running · 2 starved · 3 blocked · 4 fault ·
        5 changeover · 6 idle), but that is a fact you confirm from the manual — not an assumption the platform
        makes for you.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ReasonTree({ oee, dispatch }) {
  const tree = oee.reasonTree;
  const commit = (next) => dispatch(setConfig(['oee', 'reasonTree'], next));

  return (
    <div className="panel space-y-3 p-4">
      <p className="text-xs text-slate-500">
        The reason tree is what operators see when the line stops. Two levels: a family (mapped to an OEE
        bucket) and specific reasons. Keep it short enough to use at 2 a.m. with gloves on.
      </p>
      {tree.map((family, fi) => (
        <div key={family.id} className="rounded-lg border border-slate-700/70 bg-plant-900 p-3">
          <div className="flex items-center gap-2">
            <input className="input !w-56 !py-1 text-sm" value={family.label}
              onChange={(e) => commit(tree.map((f, i) => (i === fi ? { ...f, label: e.target.value } : f)))} />
            <select className="input !w-64 !py-1 text-xs" value={family.category}
              onChange={(e) => commit(tree.map((f, i) => (i === fi ? { ...f, category: e.target.value } : f)))}>
              <option value="equipment">Equipment</option>
              <option value="material">Material</option>
              <option value="minor">Minor stops</option>
              <option value="organizational">Organizational</option>
              <option value="quality">Quality</option>
              <option value="changeover">Changeover</option>
            </select>
            <button className="ml-auto text-slate-600 hover:text-red-400" onClick={() => commit(tree.filter((_, i) => i !== fi))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-4">
            {(family.children ?? []).map((child, ci) => (
              <span key={child.id} className="chip bg-plant-800 !px-2 !py-1 normal-case tracking-normal text-slate-300">
                <input
                  className="w-32 bg-transparent text-[11px] outline-none"
                  value={child.label}
                  onChange={(e) => commit(tree.map((f, i) => (i === fi
                    ? { ...f, children: f.children.map((c, j) => (j === ci ? { ...c, label: e.target.value } : c)) }
                    : f)))}
                />
                <button className="text-slate-600 hover:text-red-400"
                  onClick={() => commit(tree.map((f, i) => (i === fi ? { ...f, children: f.children.filter((_, j) => j !== ci) } : f)))}>
                  ×
                </button>
              </span>
            ))}
            <button className="chip bg-plant-800 !px-2 !py-1 text-slate-500 hover:text-slate-300"
              onClick={() => commit(tree.map((f, i) => (i === fi
                ? { ...f, children: [...(f.children ?? []), { id: `${f.id}-${(f.children ?? []).length + 1}`, label: 'New reason' }] }
                : f)))}>
              + reason
            </button>
          </div>
        </div>
      ))}
      <button className="btn-ghost !py-1.5 text-xs"
        onClick={() => commit([...tree, { id: `RC-${tree.length + 1}`, label: 'New family', category: 'equipment', children: [] }])}>
        <Plus className="h-3.5 w-3.5" /> Add reason family
      </button>
      {tree.length === 0 && (
        <p className="text-xs text-slate-600">No reason tree — operators can classify a stop only as "stopped".</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function CalendarTab({ oee, dispatch }) {
  const breaks = oee.calendar.breaks;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="panel space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="panel-title">Shift breaks</div>
          <button className="btn-ghost !py-1 text-xs"
            onClick={() => dispatch(setConfig(['oee', 'calendar', 'breaks'], [
              { id: 'BRK-1', start: '08:30', minutes: 15, classifiedAs: 'plannedStop' },
              { id: 'BRK-2', start: '11:00', minutes: 30, classifiedAs: 'plannedStop' },
            ]))}>
            <Wand2 className="h-3.5 w-3.5" /> Seed plant breaks
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>Shift</span>
          <span className="mono rounded border border-slate-700 bg-plant-950 px-2 py-1 text-slate-300">{oee.calendar.shiftStart}</span>
          <span>→</span>
          <span className="mono rounded border border-slate-700 bg-plant-950 px-2 py-1 text-slate-300">{oee.calendar.shiftEnd}</span>
          <span className="text-slate-600">(single day shift — fixed by the engagement)</span>
        </div>
        <EditableTable
          columns={[
            { key: 'start', label: 'Start (HH:MM)', type: 'text', mono: true, width: 120 },
            { key: 'minutes', label: 'Minutes', type: 'number', mono: true, width: 90 },
            { key: 'classifiedAs', label: 'Classified as', type: 'select', options: CATEGORY_OPTIONS.filter((o) => o.value !== 'production') },
          ]}
          rows={breaks}
          onChange={(i, key, value) => dispatch(setConfig(['oee', 'calendar', 'breaks'],
            breaks.map((b, idx) => (idx === i ? { ...b, [key]: value } : b))))}
          onAdd={() => dispatch(setConfig(['oee', 'calendar', 'breaks'],
            [...breaks, { id: `BRK-${breaks.length + 1}`, start: '09:00', minutes: 10, classifiedAs: 'plannedStop' }]))}
          onDelete={(i) => dispatch(setConfig(['oee', 'calendar', 'breaks'], breaks.filter((_, idx) => idx !== i)))}
          addLabel="Add break"
          emptyText="No breaks configured — lunch will be booked as a 30-minute breakdown."
        />
        <p className="text-[11px] text-slate-500">
          The plant stops for tea at 08:30 and lunch at 11:00. If your calendar doesn't say so, your
          availability number lies — and it lies in the direction that makes the line look broken.
        </p>
      </div>

      <div className="panel p-4">
        <div className="panel-title mb-4">Short-stop threshold</div>
        <ThresholdSlider
          label="Stops shorter than this are short stops" value={oee.shortStopThresholdMin}
          min={0} max={10} unit="min"
          onChange={(v) => dispatch(setConfig(['oee', 'shortStopThresholdMin'], v))}
          example={
            oee.shortStopThresholdMin === 0
              ? 'Stops ≤ 0 min are performance loss, not downtime events — which means every 6-second foil splice becomes a formal breakdown demanding a reason code.'
              : oee.shortStopThresholdMin > 6
                ? `Stops ≤ ${oee.shortStopThresholdMin} min are performance loss, not downtime events — at this width a real ${oee.shortStopThresholdMin}-minute blister fault disappears from the Pareto.`
                : `Stops ≤ ${oee.shortStopThresholdMin} min are performance loss, not downtime events. A 6-second foil splice → performance; a ${oee.shortStopThresholdMin + 5}-minute fault → downtime event with a reason.`
          }
        />
        <p className="mt-4 text-[11px] text-slate-500">
          A blister machine collects dozens of foil splices a shift. Booked as breakdowns they drown the Pareto;
          booked as performance loss they still show up — in the speed number, where they belong.
        </p>
      </div>
    </div>
  );
}
