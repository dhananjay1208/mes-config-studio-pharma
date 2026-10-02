import React from 'react';
import { SHIFT } from '../../data/realityTape.js';

const pct1 = (v) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`);

const LOSSES = [
  ['plannedStop', 'Planned stops (breaks)', 'bg-sky-700'],
  ['notScheduled', 'Not scheduled', 'bg-slate-600'],
  ['changeover', 'Changeover', 'bg-amber-600'],
  ['unplannedStop', 'Breakdowns', 'bg-red-700'],
  ['shortStop', 'Micro-stops', 'bg-orange-700'],
  ['blockedStarved', 'Blocked / starved', 'bg-cyan-800'],
  ['unaccounted', 'Unaccounted speed loss', 'bg-pink-800'],
  ['unclassified', 'Unclassified', 'bg-slate-500'],
];

function Row({ label, from, to, total, color, note }) {
  const left = (Math.min(from, to) / total) * 100;
  const width = Math.max(0.4, (Math.abs(to - from) / total) * 100);
  const minutes = Math.abs(to - from);
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-48 shrink-0 text-slate-400">{label}</span>
      <div className="relative h-5 flex-1 rounded bg-plant-900">
        <div className={`absolute top-0 h-5 rounded ${color}`} style={{ left: `${left}%`, width: `${width}%` }} />
      </div>
      <span className="mono w-16 shrink-0 text-right font-bold text-slate-200">{Math.round(minutes)} min</span>
      <span className="w-44 shrink-0 text-[10px] text-slate-500">{note ?? ''}</span>
    </div>
  );
}

function Stat({ label, value, tone, note }) {
  const color = tone === 'good' ? 'text-emerald-400'
    : tone === 'bad' ? 'text-red-400'
    : tone === 'warn' ? 'text-amber-400'
    : tone === 'muted' ? 'text-slate-500'
    : 'text-white';
  return (
    <div className="panel px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mono mt-1 text-lg font-bold ${color}`}>{value}</div>
      {note && <div className="mt-0.5 text-[10px] text-slate-500">{note}</div>}
    </div>
  );
}

function tone(v, good = 0.8, warn = 0.6) {
  if (v == null) return 'muted';
  return v >= good ? 'good' : v >= warn ? 'warn' : 'bad';
}

export default function OEEWaterfall({ run }) {
  const o = run.oee;
  const total = SHIFT.endMin;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Classification accuracy" value={pct1(o.classificationAccuracy)}
          tone={tone(o.classificationAccuracy, 0.9, 0.6)} note="of the day's true stop minutes, correctly categorised" />
        <Stat label="Unclassified minutes" value={`${Math.round(o.unclassifiedMin)} min`}
          tone={o.unclassifiedMin === 0 ? 'good' : o.unclassifiedMin < 30 ? 'warn' : 'bad'}
          note="grey holes in the loss picture" />
        <Stat label="True stop minutes" value={`${Math.round(o.trueStopMin)} min`} tone="default"
          note="what actually stopped, across all lines" />
      </div>

      {o.perLine.length === 0 && (
        <div className="panel p-4">
          <p className="text-xs text-red-400">No lines produced an OEE picture — nothing ran.</p>
        </div>
      )}

      {o.perLine.map((l) => {
        const b = l.buckets;
        let running = total;
        const rows = LOSSES.map(([key, label, color]) => {
          const loss = b[key] ?? 0;
          const from = running;
          running -= loss;
          return { key, label, color, from, to: running, loss };
        });
        const perfOver = l.performance != null && l.performance > 1;

        return (
          <div key={l.lineCode} className="panel space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="panel-title">{l.lineCode} — time waterfall (your state model's view of the day)</div>
              {!l.stateMapped && (
                <span className="chip ml-auto bg-red-900/60 text-red-300">no state word mapped — every stop is a grey hole</span>
              )}
            </div>

            <div className="space-y-1.5">
              <Row label={`Shift time (${SHIFT.label})`} from={0} to={total} total={total} color="bg-slate-600" />
              {rows.map((r) => (
                <Row key={r.key} label={r.label} from={r.from} to={r.to} total={total} color={r.color}
                  note={r.key === 'unaccounted' && r.loss > 0 ? 'truth stopped; the MES saw green'
                    : r.key === 'unclassified' && r.loss > 0 ? 'state word unmapped for this state'
                    : r.key === 'plannedStop' && r.loss === 0 ? 'no breaks classified!'
                    : undefined} />
              ))}
              <Row label="Net production" from={0} to={b.production} total={total} color="bg-emerald-600"
                note={`${Math.round((b.production / total) * 1000) / 10}% of the shift`} />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Availability" value={pct1(l.availability)} tone={tone(l.availability)} />
              <Stat
                label="Performance"
                value={pct1(l.performance)}
                tone={l.performance == null ? 'muted' : perfOver ? 'bad' : tone(l.performance)}
                note={l.performance == null
                  ? 'no production counter — nothing to rate'
                  : perfOver
                    ? 'over 100% — check counter scaling'
                    : undefined}
              />
              <Stat
                label="Quality"
                value={l.quality == null ? '—' : l.rejVisible ? pct1(l.quality) : '100% *'}
                tone={l.quality == null ? 'muted' : l.rejVisible ? tone(l.quality, 0.98, 0.9) : 'warn'}
                note={l.quality != null && !l.rejVisible ? '* no reject data — believe it?' : undefined}
              />
              <Stat label="OEE" value={pct1(l.oee)} tone={l.oee == null ? 'muted' : tone(l.oee, 0.75, 0.55)}
                note={l.oee == null ? 'not computable without counters' : undefined} />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <span className="chip bg-slate-800 text-slate-300">
                recorded {l.recordedCases != null ? Math.round(l.recordedCases).toLocaleString() : '—'} cases
              </span>
              <span className="chip bg-slate-800 text-slate-300">truth {l.truthCases.toLocaleString()} cases</span>
              {l.recordedCases != null && Math.abs(l.recordedCases - l.truthCases) > 0.5 && (
                <span className="chip bg-red-900/60 text-red-300">
                  counter off by {Math.round(l.recordedCases - l.truthCases).toLocaleString()} cases
                </span>
              )}
            </div>
          </div>
        );
      })}

      <p className="text-[11px] text-slate-500">
        Unclassified minutes are not neutral — they land in availability loss, so the line looks worse than it ran
        and nobody can say why. Unaccounted minutes are the opposite lie: the plant stopped and the MES kept
        counting green. Both are state-model problems, not machine problems.
      </p>
    </div>
  );
}
