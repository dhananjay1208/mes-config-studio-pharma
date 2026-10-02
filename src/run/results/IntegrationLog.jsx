import React from 'react';
import { clockLabel } from '../../data/realityTape.js';

const STATUS_CHIP = {
  sent: 'bg-emerald-900/60 text-emerald-300',
  queued: 'bg-amber-900/60 text-amber-300',
  failed: 'bg-red-900/60 text-red-300',
};

function Panel({ title, subtitle, rows, empty }) {
  const counts = {
    sent: rows.filter((r) => r.status === 'sent').length,
    queued: rows.filter((r) => r.status === 'queued').length,
    failed: rows.filter((r) => r.status === 'failed').length,
  };
  return (
    <div className="panel p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="panel-title">{title}</div>
        {rows.length > 0 && (
          <div className="ml-auto flex gap-1">
            <span className="chip bg-emerald-900/50 text-emerald-300">{counts.sent} sent</span>
            {counts.queued > 0 && <span className="chip bg-amber-900/60 text-amber-300">{counts.queued} queued</span>}
            {counts.failed > 0 && <span className="chip bg-red-900/60 text-red-300">{counts.failed} failed</span>}
          </div>
        )}
      </div>
      <p className="mb-3 text-[11px] text-slate-500">{subtitle}</p>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2.5 text-xs text-red-300">{empty}</div>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-plant-850">
              <tr className="border-b border-slate-700/70 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-2 py-1.5">Clock</th><th className="px-2 py-1.5">Type</th>
                <th className="px-2 py-1.5">Run</th><th className="px-2 py-1.5">Status</th>
                <th className="px-2 py-1.5">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-800/50 last:border-0">
                  <td className="mono px-2 py-1 text-slate-500">{clockLabel(Math.round(r.atMin))}</td>
                  <td className="mono px-2 py-1 text-slate-300">{r.type}</td>
                  <td className="mono px-2 py-1 text-slate-400">{r.runId ?? '—'}</td>
                  <td className="px-2 py-1"><span className={`chip ${STATUS_CHIP[r.status] ?? 'bg-slate-800 text-slate-300'}`}>{r.status}</span></td>
                  <td className="mono px-2 py-1 text-[10px] text-slate-400">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function IntegrationLog({ run, config }) {
  const log = run.integrationLog ?? [];
  const aps = log.filter((m) => m.system === 'APS');
  const repo = log.filter((m) => m.system === 'EU-HUB');
  const feedbackOn = Boolean(config.apsIntegration.actualsFeedback?.enabled);
  const repoOn = Boolean(config.traceability.repository?.enabled);

  return (
    <div className="space-y-4">
      <Panel
        title="MES → Cadence APS (actuals)"
        subtitle="What the plant actually did, sent back so tomorrow's schedule is planned on facts."
        rows={aps}
        empty={feedbackOn
          ? 'Actuals feedback is enabled but nothing was sent — no runs executed on the deploy day.'
          : 'Nothing was sent — actuals feedback is switched off. Cadence plans tomorrow on fiction: it still believes every run today started on time and finished full.'}
      />

      <Panel
        title="MES → EU Hub (FMD, via the L4 EPCIS gateway)"
        subtitle="EU 2016/161: serial upload, EPCIS aggregation and shipping events for every serialized carton."
        rows={repo}
        empty={repoOn
          ? 'Hub upload is enabled but nothing was uploadable — no run produced serialized product.'
          : 'Nothing was uploaded — Hub upload is switched off. Every carton that left this plant today will fail verification at the pharmacy.'}
      />

      <p className="text-[11px] text-slate-500">
        A failed Hub message is not a technical footnote: a batch whose serials are not in the EU Hub cannot be
        QP-released or dispensed. A queued message is a second chance — only if buffer-and-retry is on.
      </p>
    </div>
  );
}
