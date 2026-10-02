import React from 'react';
import { clockLabel } from '../../data/realityTape.js';

const pct1 = (v) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`);

function Stat({ label, value, tone }) {
  const color = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-red-400' : tone === 'warn' ? 'text-amber-400' : 'text-white';
  return (
    <div className="panel px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mono mt-1 text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

export default function QualityResults({ run }) {
  const q = run.quality;
  const k = run.kpis;
  const rows = q.results ?? [];
  const lineCodeOf = (d) => (d.shared ? 'shared finishing' : run.lines[d.lineIndex]?.lineCode ?? '—');

  const potent = rows.find((r) => r.defectCode === 'XCONT-POT');
  const moist = rows.find((r) => r.defectCode === 'LOD-OOS');
  const ui = rows.find((r) => r.defectCode === 'UI-FAIL');
  const fpyGap = k.fpy != null && k.fpyTruth != null && Math.abs(k.fpy - k.fpyTruth) > 0.0005;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Defects caught" value={q.defectsCaught} tone={q.defectsEscaped === 0 ? 'good' : 'default'} />
        <Stat label="Defects escaped" value={q.defectsEscaped} tone={q.defectsEscaped === 0 ? 'good' : 'bad'} />
        <Stat label="Cases held" value={q.heldCases.toLocaleString()} tone={q.heldCases > 0 ? 'warn' : 'good'} />
        <Stat label="Defective cases shipped" value={q.shippedDefectiveCases.toLocaleString()}
          tone={q.shippedDefectiveCases === 0 ? 'good' : 'bad'} />
      </div>

      {q.shippedDefectiveCases > 0 && (
        <div className="animate-andon-pulse rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm font-semibold text-red-300">
          {q.shippedDefectiveCases.toLocaleString()} defective case(s) left quarantine as releasable stock today. In a
          pharma plant that is a recall conversation with the QP and the authority, not a rework ticket.
        </div>
      )}

      <div className="panel p-4">
        <div className="panel-title mb-2">Defect ledger</div>
        {rows.length === 0 ? (
          <p className="text-xs text-emerald-400">No defects occurred this run.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-700/70 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-2 py-1.5">Code</th><th className="px-2 py-1.5">Description</th>
                  <th className="px-2 py-1.5">Where</th><th className="px-2 py-1.5">Sev</th>
                  <th className="px-2 py-1.5">Quantity</th><th className="px-2 py-1.5">Detected</th>
                  <th className="px-2 py-1.5">Held</th><th className="px-2 py-1.5">Shipped</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-b border-slate-800/50 last:border-0">
                    <td className="mono px-2 py-1 text-slate-200">{d.defectCode}</td>
                    <td className="px-2 py-1 text-slate-400">
                      {d.desc}
                      {d.window && (
                        <span className="mono ml-1.5 text-[10px] text-slate-600">
                          {clockLabel(d.window[0])}–{clockLabel(d.window[1])}
                        </span>
                      )}
                    </td>
                    <td className="mono px-2 py-1 text-slate-400">{lineCodeOf(d)}</td>
                    <td className="mono px-2 py-1 text-slate-400">{d.severity ?? '—'}</td>
                    <td className="mono px-2 py-1 text-slate-300">
                      {d.cases ? `${d.cases.toLocaleString()} cases` : d.packs ? `${d.packs.toLocaleString()} cartons` : '—'}
                    </td>
                    <td className="px-2 py-1">
                      {d.detected
                        ? <span className="chip bg-emerald-900/60 text-emerald-300" title={d.detectedBy ?? ''}>
                            {d.autoRejected ? 'auto-rejected' : 'detected'}
                          </span>
                        : <span className="chip bg-red-900/60 text-red-300">not detected</span>}
                      {d.detectedBy && <div className="mt-0.5 text-[10px] text-slate-500">{d.detectedBy}</div>}
                    </td>
                    <td className="mono px-2 py-1 text-slate-300">{(d.held ?? 0).toLocaleString()}</td>
                    <td className={`mono px-2 py-1 font-bold ${(d.shipped ?? 0) > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                      {(d.shipped ?? 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {potent && (
        <div className="panel border-red-900/60 p-4">
          <div className="panel-title mb-1.5 !text-red-400">Potent cross-contamination</div>
          <p className="text-xs text-red-300">
            The first {(potent.cases ?? 0).toLocaleString()} cases of Cardexil 20 mg carry Zentrix 50 mg residue from last night's run —
            the validated clean was not enforced and no swab was taken.{' '}
            {potent.detected
              ? `The line-clearance / first-off check after the changeover caught it (${potent.detectedBy}); ${(potent.held ?? 0).toLocaleString()} case(s) held.`
              : 'Nothing checked the first cases after the changeover, so they went to quarantine as clean product. A potent API in a product that must not contain it is a written-off batch and a patient-safety recall — the €1.28 M Monday.'}
          </p>
        </div>
      )}

      {moist && (
        <div className={`panel p-4 ${moist.detected ? '' : 'border-red-900/60'}`}>
          <div className={`panel-title mb-1.5 ${moist.detected ? '' : '!text-red-400'}`}>LOD out of window (FBD2)</div>
          <p className={`text-xs ${moist.detected ? 'text-slate-400' : 'text-red-300'}`}>
            {(moist.cases ?? 0).toLocaleString()} cases were pressed from the sub-lot FBD2 discharged while the true LOD drifted above the 2.5 % window.{' '}
            {moist.detected
              ? `The flatline rule flagged the frozen NIR probe (${moist.detectedBy}) and ${(moist.held ?? 0).toLocaleString()} case(s) were held for the lab LOD result.`
              : `The probe read a comfortable 2.1 % all morning, so nobody looked — ${(moist.shipped ?? 0).toLocaleString()} case(s) went to quarantine as releasable. A wet granulate fails hardness and dissolution on stability, months after the QP signed.`}
          </p>
        </div>
      )}

      {ui && (
        <div className={`panel p-4 ${ui.detected ? '' : 'border-red-900/60'}`}>
          <div className={`panel-title mb-1.5 ${ui.detected ? '' : '!text-red-400'}`}>Unique identifier print failures</div>
          <p className={`text-xs ${ui.detected ? 'text-slate-400' : 'text-red-300'}`}>
            {(ui.packs ?? 0).toLocaleString()} cartons were printed with unreadable DataMatrix codes (printhead 2205).{' '}
            {ui.detected
              ? `The print-and-verify camera voided ${run.trace.voidedPacks.toLocaleString()} of them before they could be bundled — no unverified carton entered a case.`
              : `Without a verify camera, all ${(ui.shipped ?? 0).toLocaleString()} shipped unverified. The EU Hub rejects the shipping event, and every one of those cartons fails verification at the pharmacy as a suspected falsified medicine.`}
          </p>
        </div>
      )}

      <div className="panel p-4">
        <div className="panel-title mb-2">First pass yield — recorded vs truth</div>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Recorded by the MES</div>
            <div className={`mono text-xl font-bold ${k.fpy == null ? 'text-slate-500' : 'text-white'}`}>{pct1(k.fpy)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Ground truth</div>
            <div className="mono text-xl font-bold text-slate-300">{pct1(k.fpyTruth)}</div>
          </div>
          {fpyGap && (
            <span className="chip bg-amber-900/60 text-amber-300">your reject counters are lying by omission</span>
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {fpyGap
            ? 'Unmapped reject counters do not make rejects disappear — they make the yield report flattering. The scrap is still in the bins at end of shift.'
            : 'Recorded yield matches reality: the reject counters are mapped and telling the truth.'}
        </p>
      </div>

      <p className="text-[11px] text-slate-500">
        Detection is placement plus wiring: an SPC plan on an unmapped IPC signal sees nothing, and a checkweigher with no
        plan behind it just weighs. Containment decides whether a caught defect stops the pallet — severity 3 with no
        containment rule still leaves quarantine as releasable stock.
      </p>
    </div>
  );
}
