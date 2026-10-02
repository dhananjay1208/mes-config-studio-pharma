import React, { useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, XCircle, ArrowRight, Timer, Radio, AlertTriangle } from 'lucide-react';
import { useStudio, useStudioDispatch } from '../../engine/StudioContext.jsx';
import { setConfig } from '../../engine/actions.js';
import { useModuleTab } from '../../components/config/useModuleTab.js';
import { deriveScheduleBank, unmappedScheduleFields } from '../../engine/scheduleCheck.js';
import { validateApsIntegration } from '../../engine/validate.js';
import { APS_FIELDS, MES_SCHEDULE_FIELDS, DEPLOY_DAY } from '../../data/apsFeed.js';
import { clockLabel } from '../../data/realityTape.js';
import EditableTable from '../../components/config/EditableTable.jsx';
import TogglePanel from '../../components/config/TogglePanel.jsx';
import ThresholdSlider from '../../components/config/ThresholdSlider.jsx';
import RuleRow, { RuleNum } from '../../components/config/RuleRow.jsx';

const TABS = [
  ['feed', 'Schedule Feed'],
  ['checks', 'Feasibility Checks'],
  ['changeover', 'Changeover Rules'],
  ['release', 'Release & Feedback'],
];

const STATUS_CHIP = {
  received: 'bg-slate-700/60 text-slate-300',
  rejected: 'bg-red-900/60 text-red-300',
  infeasible: 'bg-amber-900/60 text-amber-300',
  accepted: 'bg-sky-900/60 text-sky-300',
  released: 'bg-emerald-900/60 text-emerald-300',
};

export default function ApsIntegrationModule() {
  const state = useStudio();
  const dispatch = useStudioDispatch();
  const [tab, setTab] = useModuleTab('feed');
  const bank = useMemo(() => deriveScheduleBank(state.config), [state.config]);
  const findings = useMemo(() => validateApsIntegration(state.config), [state.config]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-700/50 bg-violet-950/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-white">
            Cadence APS owns the sequence. ForgeMES validates and executes — it never re-orders runs.
          </span>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          Cadence APS (Northline Planning Systems) sends sequenced runs per line. Your job is the interface, the
          feasibility checks, the changeover model the checks reason with, the release gate, and the actuals that go back.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${
              tab === id ? 'bg-violet-600/20 text-violet-300' : 'text-slate-500 hover:bg-plant-800 hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex gap-3 text-[11px] text-slate-500">
          <span>{bank.entries.length} schedule messages</span>
          <span className="text-emerald-400">{bank.dayRuns.length} released for {DEPLOY_DAY}</span>
        </div>
      </div>

      {tab === 'feed' && <FeedTab config={state.config} dispatch={dispatch} bank={bank} />}
      {tab === 'checks' && <ChecksTab config={state.config} dispatch={dispatch} setTab={setTab} />}
      {tab === 'changeover' && <ChangeoverTab config={state.config} dispatch={dispatch} />}
      {tab === 'release' && <ReleaseTab config={state.config} dispatch={dispatch} />}

      <div className="panel p-4">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="panel-title !text-slate-300">Configuration checks ({findings.length})</span>
        </div>
        {findings.length === 0 ? (
          <p className="text-xs text-emerald-400">The schedule interface is complete, gated and fed back.</p>
        ) : (
          <ul className="space-y-1.5">
            {findings.map((f) => (
              <li key={f.id} className={`text-[11px] leading-snug ${f.level === 'error' ? 'text-red-400' : 'text-amber-400/90'}`}>
                • {f.msg}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schedule feed — interface map + the schedule bank
// ---------------------------------------------------------------------------
function FeedTab({ config, dispatch, bank }) {
  const map = config.apsIntegration.interfaceMap ?? [];
  const decisions = config.apsIntegration.decisions ?? {};
  const missing = unmappedScheduleFields(config, MES_SCHEDULE_FIELDS);

  const setMapping = (apsField, mesField) => {
    const next = map.filter((r) => r.apsField !== apsField && (!mesField || r.mesField !== mesField));
    if (mesField) next.push({ apsField, mesField });
    dispatch(setConfig(['apsIntegration', 'interfaceMap'], next));
  };

  const decide = (msgId, decision) =>
    dispatch(setConfig(['apsIntegration', 'decisions'], { ...decisions, [msgId]: decision }));

  const rows = APS_FIELDS.map((f) => ({
    id: f.field,
    apsField: f.field,
    desc: f.desc,
    mesField: map.find((r) => r.apsField === f.field)?.mesField ?? '',
  }));

  const columns = [
    { key: 'apsField', label: 'APS field (Cadence message)', type: 'readonly', mono: true, width: 120 },
    { key: 'desc', label: 'Description', type: 'readonly' },
    { key: 'arrow', label: '', width: 30, render: () => <ArrowRight className="h-3.5 w-3.5 text-slate-600" /> },
    { key: 'mesField', label: 'MES schedule field', type: 'select', width: 230,
      options: MES_SCHEDULE_FIELDS.map((f) => ({ value: f.field, label: `${f.field} — ${f.desc}` })) },
  ];

  return (
    <div className="space-y-4">
      <div className="panel space-y-4 p-5">
        <p className="text-xs text-slate-500">
          Map the Cadence schedule message to the MES run model. Three of these fields are planning metadata the
          MES has no use for — leave them unmapped. Without runId, lineCode and a planned start, a message cannot
          become an executable run at all.
        </p>
        <EditableTable
          columns={columns}
          rows={rows}
          onChange={(i, key, value) => { if (key === 'mesField') setMapping(rows[i].apsField, value); }}
          emptyText="No APS fields."
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {missing.length === 0 ? (
            <span className="text-[11px] text-emerald-400">All MES schedule fields are mapped.</span>
          ) : (
            <>
              <span className="text-[11px] text-amber-400">Unmapped MES fields:</span>
              {missing.map((f) => (
                <span key={f.field} className="chip bg-amber-900/50 text-amber-300">{f.field}</span>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="panel p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="panel-title !text-slate-300">Schedule bank</span>
          <p className="flex-1 text-[11px] text-slate-500">
            Every run Cadence sent, in arrival order — the Cardexil EXPORT rush call-off arrives last with a
            frozen-horizon override. Findings are what your enabled feasibility checks see; the release gate decides whether they
            stop anything.
          </p>
        </div>

        {bank.mapIncomplete && (
          <p className="mb-3 text-[11px] text-red-400">
            No message can be parsed — the APS interface map is incomplete.
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-700/70">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700/70 bg-plant-900 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2">Run</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Line</th>
                <th className="px-3 py-2">Planned</th>
                <th className="px-3 py-2">Cases</th>
                <th className="px-3 py-2">Feasibility findings</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {bank.entries.map((e) => (
                <tr key={e.msg.msgId} className="border-b border-slate-800/60 last:border-0 align-top hover:bg-plant-900/50">
                  <td className="mono px-3 py-2 text-[11px] text-slate-400">{e.msg.msgId}</td>
                  <td className="mono px-3 py-2 text-[11px] text-slate-200">{e.run.runId ?? '—'}</td>
                  <td className="mono px-3 py-2 text-[11px] text-slate-300">{e.run.orderNo ?? '—'}</td>
                  <td className="mono px-3 py-2 text-[11px] text-slate-300">{e.run.lineCode ?? '—'}</td>
                  <td className="mono px-3 py-2 text-[11px] text-slate-400">
                    {e.run.plannedStartTs ?? '—'}
                    {e.run.plannedEndTs ? ` → ${e.run.plannedEndTs.split(' ')[1] ?? e.run.plannedEndTs}` : ''}
                  </td>
                  <td className="mono px-3 py-2 text-[11px] text-slate-300">{e.run.qtyCases || '—'}</td>
                  <td className="px-3 py-2">
                    {e.findings.length === 0 ? (
                      <span className="text-[11px] text-slate-600">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {e.findings.map((f, i) => (
                          <li key={i} className="text-[11px] leading-snug text-red-400">
                            <span className="chip mr-1 bg-slate-700/60 text-slate-300">{f.checkId}</span>
                            {f.msg}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2"><span className={`chip ${STATUS_CHIP[e.status]}`}>{e.status}</span></td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <button title="Accept" onClick={() => decide(e.msg.msgId, 'accepted')}
                        className={e.decision === 'accepted' ? 'text-emerald-400' : 'text-slate-600 hover:text-emerald-400'}>
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                      <button title="Reject" onClick={() => decide(e.msg.msgId, 'rejected')}
                        className={e.decision === 'rejected' ? 'text-red-400' : 'text-slate-600 hover:text-red-400'}>
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel p-5">
        <div className="panel-title mb-3">Wednesday execution set</div>
        {bank.dayRuns.length === 0 ? (
          <p className="text-xs text-amber-400">
            No run is released for {DEPLOY_DAY} — the deploy day would start with two idle lines.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Object.entries(bank.runsByLine).map(([lineCode, runs]) => (
              <div key={lineCode} className="rounded-lg border border-slate-700/70 bg-plant-900/60 p-3">
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="mono text-xs font-bold text-violet-300">{lineCode}</span>
                  <span className="text-[11px] text-slate-500">{runs.length} runs</span>
                </div>
                <ul className="space-y-1">
                  {runs.map((r) => (
                    <li key={r.runId} className="flex items-baseline gap-2 text-[11px]">
                      <span className="mono text-slate-400">{clockLabel(r.startMin)}–{clockLabel(r.endMin)}</span>
                      <span className="mono text-slate-200">{r.runId}</span>
                      <span className="text-slate-500">{r.skuCode ?? r.orderNo}</span>
                      <span className="mono ml-auto text-slate-400">{r.qtyCases} cs</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-500">
          This is exactly what Deploy &amp; Run executes — in Cadence's order, at Cadence's times.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feasibility checks
// ---------------------------------------------------------------------------
const FEASIBILITY = [
  ['orderReleased', 'Order is released',
    'Every run must reference a released ERP production order.',
    'Off: a run against PO-78899 — an order ERP never sent — executes and produces stock nobody ordered.'],
  ['blendAvailable', 'Released blend is available',
    'The IBCs that may dock on the line must hold enough released blend for the run that day.',
    'Off: 240 cases of Cardexil 20 mg are scheduled against 200 kg of released blend — the press empties the IBC mid-batch.'],
  ['siloRouting', 'IBC docking & potent segregation',
    'An IBC with the run\'s blend must be allowed to dock on the target line, and a potent product only runs on a segregated line.',
    'Off: Zentrix 50 mg lands on Line 3, where no potent IBC may dock and which is not segregated — it starves, and it cross-contaminates every product after it.'],
  ['changeoverRules', 'Changeover fits the plan',
    'The gap Cadence planned must cover the transition your changeover model requires — including the validated clean.',
    'Off: Cardexil 20 mg is planned 30 minutes after a Zentrix run that needs a 360-minute validated clean — the whole day behind it slips.'],
  ['materialReadiness', 'Material & identifier readiness',
    'The SKU must be configured, have a BOM, and (for export) an assigned EXP serial pool.',
    'Off: the Cardexil EXPORT rush call-off looks perfect and reaches the serialization station with nothing to print.'],
];

function ChecksTab({ config, dispatch, setTab }) {
  const checks = config.apsIntegration.feasibilityChecks ?? {};
  const cm = config.apsIntegration.changeoverModel ?? {};
  const zeroRows = CHANGEOVER_ROWS.filter(([key]) => !(cm[key] > 0)).map(([, label]) => label);

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Feasibility validation is what makes the MES more than a schedule printer. Each check runs over the whole
        horizon in chronological order — silo commitments and previous runs accumulate the way time does — so a
        bad Thursday run is flagged today, not discovered at 09:10 on Thursday.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {FEASIBILITY.map(([key, title, description]) => (
          <TogglePanel
            key={key}
            title={title}
            description={description}
            enabled={Boolean(checks[key])}
            onToggle={(v) => dispatch(setConfig(['apsIntegration', 'feasibilityChecks', key], v))}
          >
            <p className="text-[11px] text-slate-400">Runs against every message in the schedule bank.</p>
          </TogglePanel>
        ))}
      </div>
      {checks.changeoverRules && zeroRows.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <p className="text-[11px] leading-snug text-amber-400/90">
            The changeover check reasons with YOUR Changeover Rules numbers — and{' '}
            {zeroRows.length === CHANGEOVER_ROWS.length ? 'all of them are' : `"${zeroRows.join('", "')}" ${zeroRows.length === 1 ? 'is' : 'are'}`} currently
            0 minutes, so {zeroRows.length === 1 ? 'that transition looks' : 'those transitions look'} free and will never be flagged.{' '}
            <button onClick={() => setTab('changeover')} className="font-semibold text-violet-400 hover:text-violet-300">
              Set the numbers →
            </button>
          </p>
        </div>
      )}
      <ul className="space-y-1">
        {FEASIBILITY.filter(([key]) => !checks[key]).map(([key, , , consequence]) => (
          <li key={key} className="text-[11px] leading-snug text-amber-400/90">• {consequence}</li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Changeover rules — the belief the feasibility checks reason with
// ---------------------------------------------------------------------------
const CHANGEOVER_ROWS = [
  ['sameBlendSameFormatMin', 'Same family & tooling — strength / market / batch change (line clearance)', 20],
  ['blendChangeMin', 'Product change, same tooling (minor clean)', 120],
  ['formatChangeMin', 'Format / tooling change (T11 ↔ T4 mini-tablet)', 180],
  ['potentCleanMin', 'Potent → non-potent: validated clean + swab + QA release', 360],
];

function ChangeoverTab({ config, dispatch }) {
  const cm = config.apsIntegration.changeoverModel ?? {};
  const purge = config.apsIntegration.purgeEnforcement ?? {};

  return (
    <div className="space-y-4">
      <div className="panel space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-violet-400" />
          <span className="panel-title !text-slate-300">Changeover model (minutes)</span>
        </div>
        <p className="text-[11px] text-slate-500">
          This is what the MES BELIEVES a transition costs — the schedule validator compares Cadence's planned gaps
          against these numbers. The plant's real physics do not care what you type here; they only decide what
          the day looks like when you get it wrong. The Cadence master-data printout on the planner's desk reads
          20 / 120 / 180 / 360 (the potent clean is 6 hours plus the lab wait).
        </p>
        <div className="space-y-2">
          {CHANGEOVER_ROWS.map(([key, label, hint]) => (
            <RuleRow key={key} tone={key === 'potentCleanMin' ? 'hard' : 'default'}>
              <span className="w-[26rem]">{label}</span>
              <span>needs</span>
              <RuleNum
                value={cm[key] ?? 0}
                min={0}
                max={480}
                onChange={(v) => dispatch(setConfig(['apsIntegration', 'changeoverModel', key], v))}
              />
              <span>min</span>
              <span className="mono ml-auto text-[10px] text-slate-600">printout: {hint}</span>
            </RuleRow>
          ))}
        </div>
      </div>

      <TogglePanel
        title="Enforce the validated potent-product clean"
        description="Dispatch the clean, the swab sampling and the QA release into the night window rather than the shift."
        enabled={Boolean(purge.enabled)}
        onToggle={(v) => dispatch(setConfig(['apsIntegration', 'purgeEnforcement', 'enabled'], v))}
      >
        <p className="text-[11px] text-slate-400">
          The clean is dispatched as work in the night window — Line 5 opens released and clean at 06:00 and the
          day keeps its full eight hours.
        </p>
      </TogglePanel>
      {!purge.enabled && (
        <p className="text-[11px] leading-snug text-amber-400/90">
          • With enforcement off, the product after a Zentrix 50 mg run starts on a contaminated line — potent
          cross-contamination is a severity-3 defect the blister camera cannot see.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Release gate + actuals feedback
// ---------------------------------------------------------------------------
const FEEDBACK_FIELDS = [
  ['actualStart', 'actualStart'],
  ['actualEnd', 'actualEnd'],
  ['goodCases', 'goodCases'],
  ['adherenceFlag', 'adherenceFlag'],
];

function ReleaseTab({ config, dispatch }) {
  const gate = config.apsIntegration.releaseGate ?? {};
  const fb = config.apsIntegration.actualsFeedback ?? {};
  const fields = fb.fields ?? [];

  const toggleField = (f) => {
    const next = fields.includes(f) ? fields.filter((x) => x !== f) : [...fields, f];
    dispatch(setConfig(['apsIntegration', 'actualsFeedback', 'fields'], next));
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="panel space-y-4 p-5">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-violet-400" />
          <span className="panel-title !text-slate-300">Release gate</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => dispatch(setConfig(['apsIntegration', 'releaseGate', 'mode'], 'autoAccept'))}
            className={gate.mode === 'autoAccept' ? 'btn-primary flex-1' : 'btn-ghost flex-1'}
          >
            Auto-accept
          </button>
          <button
            onClick={() => dispatch(setConfig(['apsIntegration', 'releaseGate', 'mode'], 'blockOnError'))}
            className={gate.mode === 'blockOnError' ? 'btn-primary flex-1' : 'btn-ghost flex-1'}
          >
            Block on error
          </button>
        </div>
        <p className="text-[11px] leading-snug text-slate-500">
          {gate.mode === 'blockOnError'
            ? 'A run with any feasibility finding is held as infeasible and never reaches the line. The planner gets the finding today, while the schedule can still be changed — that is the entire point of validating.'
            : 'Feasibility findings are computed, displayed, and then ignored: every run is accepted and executed anyway. The checks become decoration.'}
        </p>
      </div>

      <div className="space-y-4">
        <TogglePanel
          title="Send actuals back to Cadence APS"
          description="Close the loop — the planner reschedules on what happened, not on what was planned."
          enabled={Boolean(fb.enabled)}
          onToggle={(v) => dispatch(setConfig(['apsIntegration', 'actualsFeedback', 'enabled'], v))}
        >
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Fields sent</div>
              <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_FIELDS.map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => toggleField(value)}
                    className={`chip !px-2.5 !py-1 !text-[11px] normal-case tracking-normal transition-colors ${
                      fields.includes(value)
                        ? 'bg-violet-600/25 text-violet-200 ring-1 ring-violet-500'
                        : 'bg-plant-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {fields.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-400">No fields selected — Cadence receives empty envelopes.</p>
              )}
            </div>

            <ThresholdSlider
              label="Resend on slip"
              value={fb.onDelayMin ?? 0}
              min={0} max={120} unit="min"
              onChange={(v) => dispatch(setConfig(['apsIntegration', 'actualsFeedback', 'onDelayMin'], v))}
              example={`Resend a shifted completion when a run slips more than ${fb.onDelayMin ?? 0} min. Zero means every micro-slip republishes; too large and Cadence plans tomorrow around a finish time that never happened.`}
            />
          </div>
        </TogglePanel>

        {!fb.enabled && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2.5">
            <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            <p className="text-[11px] leading-snug text-amber-400/90">
              With feedback off, tomorrow's schedule is built on yesterday's fiction — Cadence keeps planning
              against plan times the plant has not hit for weeks.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
