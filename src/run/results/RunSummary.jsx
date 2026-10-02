import React from 'react';

const pct1 = (v) => (v == null || !Number.isFinite(v) ? null : `${(v * 100).toFixed(1)}%`);

function Tile({ label, value, sub, tone = 'default', noData = false }) {
  const color = tone === 'good' ? 'text-emerald-400'
    : tone === 'bad' ? 'text-red-400'
    : tone === 'warn' ? 'text-amber-400'
    : 'text-white';
  return (
    <div className="panel px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mono mt-1 text-xl font-bold ${noData ? 'text-slate-500' : color}`}>
        {noData ? '—' : value}
      </div>
      {noData
        ? <span className="chip mt-1 bg-slate-800 text-slate-400">no data</span>
        : sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function pctTone(v, good, warn) {
  if (v == null) return 'default';
  return v >= good ? 'good' : v >= warn ? 'warn' : 'bad';
}

const KIND_CHIP = {
  'run-start': 'bg-emerald-900/60 text-emerald-300',
  'run-end': 'bg-slate-800 text-slate-300',
  changeover: 'bg-amber-900/60 text-amber-300',
  purge: 'bg-violet-600/20 text-violet-300',
  starve: 'bg-orange-900/60 text-orange-300',
  'shift-end': 'bg-red-900/60 text-red-300',
  serialization: 'bg-red-900/60 text-red-300',
  containment: 'bg-sky-900/60 text-sky-300',
};

export default function RunSummary({ run }) {
  const k = run.kpis;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Shipped cases" value={`${k.shippedCases.toLocaleString()} / ${k.plannedCases.toLocaleString()}`}
          sub={`${k.producedCases.toLocaleString()} produced`}
          tone={k.shippedCases >= k.plannedCases * 0.95 ? 'good' : k.shippedCases >= k.plannedCases * 0.7 ? 'warn' : 'bad'} />
        <Tile label="Held cases" value={k.heldCases.toLocaleString()}
          sub={k.heldCases > 0 ? 'quality holds + unserialized product' : 'nothing held'}
          tone={k.heldCases === 0 ? 'good' : 'warn'} />
        <Tile label="Schedule adherence" value={pct1(k.scheduleAdherence)}
          sub={`start ${pct1(k.startAdherence)} · volume ${pct1(k.volumeAdherence)}`}
          tone={pctTone(k.scheduleAdherence, 0.85, 0.6)} />
        <Tile label="OEE (avg)" value={pct1(k.oee)} noData={k.oee == null}
          sub={k.oee != null && !k.oeeTrusted ? 'built on unreliable data' : undefined}
          tone={k.oee != null && !k.oeeTrusted ? 'warn' : pctTone(k.oee, 0.75, 0.55)} />
        <Tile label="First pass yield" value={pct1(k.fpy)} noData={k.fpy == null}
          sub={k.fpy != null && k.fpyTruth != null && Math.abs(k.fpy - k.fpyTruth) > 0.0005
            ? `truth says ${pct1(k.fpyTruth)}` : undefined}
          tone={pctTone(k.fpy, 0.95, 0.85)} />
        <Tile label="UI verify rate" value={pct1(k.uiVerifyRate)} noData={k.uiVerifyRate == null}
          tone={pctTone(k.uiVerifyRate, 0.999, 0.98)} />
        <Tile label="Data fidelity" value={pct1(k.dataFidelity)}
          sub="correctly-recorded signal-minutes"
          tone={pctTone(k.dataFidelity, 0.9, 0.6)} />
        <Tile label="€ loss (day)" value={`€ ${k.euroLoss.toLocaleString()}`}
          tone={k.euroLoss > 5000 ? 'bad' : k.euroLoss > 0 ? 'warn' : 'good'} />
      </div>

      {k.oee != null && !k.oeeTrusted && (
        <div className="panel border-amber-800/60 px-4 py-3">
          <div className="text-xs font-semibold text-amber-300">This OEE number cannot be reported as it stands</div>
          <ul className="mt-1.5 space-y-0.5">
            {(k.oeeTrustIssues ?? []).map((t, i) => (
              <li key={i} className="text-[11px] text-amber-200/80">· {t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel flex flex-wrap items-center gap-2 px-4 py-3">
        <span className={`chip ${k.defectsEscaped === 0 ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/60 text-red-300'}`}>
          defects {k.defectsCaught} caught / {k.defectsEscaped} escaped
        </span>
        <span className={`chip ${k.defectsShipped === 0 ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/60 text-red-300'}`}>
          {k.defectsShipped} defective cases shipped
        </span>
        <span className={`chip ${k.repositoryFailed === 0 ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/60 text-red-300'}`}>
          repository {k.repositoryReported} sent / {k.repositoryQueued} queued / {k.repositoryFailed} failed
        </span>
        <span className={`chip ${k.apsFeedbackSent > 0 ? 'bg-emerald-900/50 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
          {k.apsFeedbackSent} APS messages sent
        </span>
        <span className={`chip ${k.unclassifiedMin === 0 ? 'bg-emerald-900/50 text-emerald-300' : 'bg-amber-900/60 text-amber-300'}`}>
          {Math.round(k.unclassifiedMin)} unclassified minutes
        </span>
      </div>

      {run.identityFindings.length > 0 && (
        <div className="panel border-red-900/60 p-4">
          <div className="panel-title mb-2 !text-red-400">Identity / serialization findings</div>
          <ul className="space-y-1">
            {run.identityFindings.slice(0, 5).map((f) => (
              <li key={f.id} className="text-xs text-red-300">• {f.msg}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel p-4">
        <div className="panel-title mb-2">Shift event log</div>
        {run.events.length === 0 ? (
          <p className="text-xs text-slate-600">A quiet day — no notable events.</p>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {run.events.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="mono w-12 shrink-0 text-slate-500">{e.clock}</span>
                <span className={`chip shrink-0 ${KIND_CHIP[e.kind] ?? 'bg-slate-800 text-slate-300'}`}>{e.kind}</span>
                <span className="text-slate-300">{e.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
