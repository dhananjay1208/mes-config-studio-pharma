import React, { useMemo, useState } from 'react';
import { Inbox, CheckCircle2, XCircle, ShieldCheck, Send, ArrowRight, AlertTriangle } from 'lucide-react';
import { useStudio, useStudioDispatch } from '../../engine/StudioContext.jsx';
import { setConfig } from '../../engine/actions.js';
import { useModuleTab } from '../../components/config/useModuleTab.js';
import { deriveOrderBank, unmappedMesFields } from '../../engine/orderBank.js';
import { validateOrders } from '../../engine/validate.js';
import { ERP_FIELDS, MES_FIELDS } from '../../data/erpFeed.js';
import EditableTable from '../../components/config/EditableTable.jsx';
import TogglePanel from '../../components/config/TogglePanel.jsx';

const TABS = [
  ['interface', 'ERP Interface'],
  ['inbox', 'Order Inbox'],
  ['release', 'Validation & Release'],
];

const STATUS_CHIP = {
  received: 'bg-slate-700/60 text-slate-300',
  rejected: 'bg-red-900/60 text-red-300',
  error: 'bg-amber-900/60 text-amber-300',
  validated: 'bg-sky-900/60 text-sky-300',
  released: 'bg-emerald-900/60 text-emerald-300',
};

export default function OrdersModule() {
  const state = useStudio();
  const dispatch = useStudioDispatch();
  const [tab, setTab] = useModuleTab('interface');
  const bank = useMemo(() => deriveOrderBank(state.config), [state.config]);
  const findings = useMemo(() => validateOrders(state.config), [state.config]);

  return (
    <div className="space-y-4">
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
          <span>{bank.entries.length} messages</span>
          <span className="text-sky-400">{bank.validated.length} validated</span>
          <span className="text-emerald-400">{bank.released.length} released</span>
        </div>
      </div>

      {tab === 'interface' && <InterfaceTab config={state.config} dispatch={dispatch} />}
      {tab === 'inbox' && <InboxTab config={state.config} dispatch={dispatch} bank={bank} />}
      {tab === 'release' && <ReleaseTab config={state.config} dispatch={dispatch} bank={bank} />}

      <div className="panel p-4">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="panel-title !text-slate-300">Configuration checks ({findings.length})</span>
        </div>
        {findings.length === 0 ? (
          <p className="text-xs text-emerald-400">The ERP interface is complete and the order bank is gated.</p>
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
// ERP interface field mapping — one row per inbound field
// ---------------------------------------------------------------------------
function InterfaceTab({ config, dispatch }) {
  const map = config.orders.interfaceMap ?? [];
  const missing = unmappedMesFields(config, MES_FIELDS);

  const setMapping = (erpField, mesField) => {
    // One ERP field feeds at most one MES field, and each MES field is fed once.
    const next = map.filter((r) => r.erpField !== erpField && (!mesField || r.mesField !== mesField));
    if (mesField) next.push({ erpField, mesField });
    dispatch(setConfig(['orders', 'interfaceMap'], next));
  };

  const rows = ERP_FIELDS.map((f) => ({
    id: f.field,
    erpField: f.field,
    desc: f.desc,
    mesField: map.find((r) => r.erpField === f.field)?.mesField ?? '',
  }));

  const columns = [
    { key: 'erpField', label: 'ERP field (inbound IDoc)', type: 'readonly', mono: true, width: 110 },
    { key: 'desc', label: 'Description', type: 'readonly' },
    { key: 'arrow', label: '', width: 30, render: () => <ArrowRight className="h-3.5 w-3.5 text-slate-600" /> },
    { key: 'mesField', label: 'MES order field', type: 'select', width: 230,
      options: MES_FIELDS.map((f) => ({ value: f.field, label: `${f.field} — ${f.desc}` })) },
  ];

  return (
    <div className="panel space-y-4 p-5">
      <p className="text-xs text-slate-500">
        Process orders arrive from corporate SAP S/4HANA as IDoc-style messages. Map each inbound field to the MES
        order model — a missing mapping leaves a hole in every order in the bank. (Two of these ERP fields are
        noise. Real interfaces carry plenty.)
      </p>
      <EditableTable
        columns={columns}
        rows={rows}
        onChange={(i, key, value) => { if (key === 'mesField') setMapping(rows[i].erpField, value); }}
        emptyText="No ERP fields."
      />
      {missing.length > 0 ? (
        <p className="text-[11px] text-amber-400">
          Unmapped MES fields: {missing.map((f) => f.field).join(', ')} — orders will arrive missing these values.
        </p>
      ) : (
        <p className="text-[11px] text-emerald-400">All MES order fields are mapped.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order inbox — accept/reject inbound messages
// ---------------------------------------------------------------------------
function InboxTab({ config, dispatch, bank }) {
  const decisions = config.orders.decisions ?? {};

  const decide = (msgId, decision) =>
    dispatch(setConfig(['orders', 'decisions'], { ...decisions, [msgId]: decision }));

  const triage = () => {
    const next = { ...decisions };
    for (const e of bank.entries) next[e.msg.msgId] = e.failures.length > 0 ? 'rejected' : 'accepted';
    dispatch(setConfig(['orders', 'decisions'], next));
  };

  return (
    <div className="panel p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-violet-400" />
          <span className="panel-title !text-slate-300">Inbound order messages</span>
        </div>
        <p className="flex-1 text-[11px] text-slate-500">
          Accepting a message that fails validation does not fix it — it parks it in the bank as an error and
          keeps it out of release.
        </p>
        <button onClick={triage} className="btn-ghost !py-1 text-xs">Accept all clean / reject all failing</button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-700/70">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700/70 bg-plant-900 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2">Message</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">UoM</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2">Prio</th>
              <th className="px-3 py-2">Market</th>
              <th className="px-3 py-2">Validation</th>
              <th className="px-3 py-2">Status</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {bank.entries.map((e) => (
              <tr key={e.msg.msgId} className="border-b border-slate-800/60 last:border-0 align-top hover:bg-plant-900/50">
                <td className="mono px-3 py-2 text-[11px] text-slate-400">{e.msg.msgId}</td>
                <td className="mono px-3 py-2 text-[11px] text-slate-200">{e.parsed.orderNo ?? '—'}</td>
                <td className="mono px-3 py-2 text-[11px] text-slate-300">{e.parsed.skuCode || '—'}</td>
                <td className="mono px-3 py-2 text-[11px] text-slate-300">{e.parsed.qtyCases ?? '—'}</td>
                <td className="mono px-3 py-2 text-[11px] text-slate-400">{e.parsed.uom ?? '—'}</td>
                <td className="mono px-3 py-2 text-[11px] text-slate-400">{e.parsed.dueDate ?? '—'}</td>
                <td className="mono px-3 py-2 text-[11px] text-slate-400">{e.parsed.priority ?? '—'}</td>
                <td className="mono px-3 py-2 text-[11px] text-slate-400">{e.parsed.market ?? '—'}</td>
                <td className="px-3 py-2">
                  {e.failures.length === 0 ? (
                    <span className="text-[11px] text-slate-600">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {e.failures.map((f, i) => (
                        <li key={i} className="text-[11px] leading-snug text-red-400">{f}</li>
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
  );
}

// ---------------------------------------------------------------------------
// Validation checks + release rule
// ---------------------------------------------------------------------------
const CHECKS = [
  ['skuValid', 'SKU is sellable',
    'The ordered SKU must exist in Products & Materials.',
    'Off: "CDX-40" — a strength Helvion never registered — is accepted, scheduled, and discovered at the press.'],
  ['uomIsCases', 'Quantity is in cases',
    'The unit of measure must be CS.',
    'Off: a tablet-denominated order (1,600,000 ST = pieces) becomes 1.6 million cases — 4,000 shifts of production, planned for Thursday.'],
  ['bomExists', 'BOM exists',
    'A BOM must exist for the ordered SKU.',
    'Off: the order releases, the batch starts, and the packaging line has no film, foil, cartons or leaflets to consume.'],
  ['uiRangeAssigned', 'Serial pool assigned',
    'A serial-number pool for the SKU\'s market must be assigned.',
    'Off: export cartons reach the serialization station with no legal identity to print — a regulatory incident, not a defect.'],
];

function ReleaseTab({ config, dispatch, bank }) {
  const checks = config.orders.validationChecks;
  const rule = config.orders.releaseRule;
  const manualReleased = config.orders.manualReleased ?? [];

  const counts = bank.entries.reduce((acc, e) => ({ ...acc, [e.status]: (acc[e.status] ?? 0) + 1 }), {});

  const toggleRelease = (orderNo) => {
    const next = manualReleased.includes(orderNo)
      ? manualReleased.filter((o) => o !== orderNo)
      : [...manualReleased, orderNo];
    dispatch(setConfig(['orders', 'manualReleased'], next));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {['received', 'rejected', 'error', 'validated', 'released'].map((s) => (
          <span key={s} className={`chip ${STATUS_CHIP[s]}`}>{counts[s] ?? 0} {s}</span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-violet-400" />
            <span className="panel-title !text-slate-300">Inbound validation checks</span>
          </div>
          {CHECKS.map(([key, title, description]) => (
            <TogglePanel
              key={key}
              title={title}
              description={description}
              enabled={Boolean(checks[key])}
              onToggle={(v) => dispatch(setConfig(['orders', 'validationChecks', key], v))}
            >
              <p className="text-[11px] text-slate-400">This check now runs on every inbound message.</p>
            </TogglePanel>
          ))}
          <ul className="space-y-1">
            {CHECKS.filter(([key]) => !checks[key]).map(([key, , , consequence]) => (
              <li key={key} className="text-[11px] leading-snug text-amber-400/90">• {consequence}</li>
            ))}
          </ul>
        </div>

        <div className="panel space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-violet-400" />
            <span className="panel-title !text-slate-300">Release rule</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => dispatch(setConfig(['orders', 'releaseRule', 'mode'], 'manual'))}
              className={rule.mode === 'manual' ? 'btn-primary flex-1' : 'btn-ghost flex-1'}
            >
              Manual release
            </button>
            <button
              onClick={() => dispatch(setConfig(['orders', 'releaseRule', 'mode'], 'horizon'))}
              className={rule.mode === 'horizon' ? 'btn-primary flex-1' : 'btn-ghost flex-1'}
            >
              Rolling horizon
            </button>
          </div>

          {rule.mode === 'horizon' ? (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Horizon (orders)
              </label>
              <input
                className="input mono"
                type="number"
                min={0}
                value={rule.horizonOrders ?? 0}
                onChange={(e) => dispatch(setConfig(['orders', 'releaseRule', 'horizonOrders'], Number(e.target.value)))}
              />
              <p className="mt-2 text-[11px] text-slate-500">
                The {rule.horizonOrders ?? 0} earliest-due validated orders are released automatically. Too small and
                Cadence's runs reference orders the MES has not released — every one of them fails the
                order-released check.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {bank.validated.length === 0 && (
                  <span className="text-[11px] text-amber-400">No validated orders yet — accept clean messages first.</span>
                )}
                {bank.validated.map((o) => (
                  <button
                    key={o.orderNo}
                    onClick={() => toggleRelease(o.orderNo)}
                    className={`chip !px-2.5 !py-1 !text-[11px] normal-case tracking-normal transition-colors ${
                      manualReleased.includes(o.orderNo)
                        ? 'bg-violet-600/25 text-violet-200 ring-1 ring-violet-500'
                        : 'bg-plant-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {o.orderNo} · {o.skuCode}
                  </button>
                ))}
              </div>
              <button
                className="btn-ghost !py-1 text-xs"
                onClick={() => dispatch(setConfig(['orders', 'manualReleased'], bank.validated.map((o) => o.orderNo)))}
              >
                Release all validated ({bank.validated.length})
              </button>
              <p className="text-[11px] text-slate-500">
                Currently released: {bank.released.length}. Hand release is auditable and slow — exactly why plants
                move to a horizon once the interface is trusted.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
