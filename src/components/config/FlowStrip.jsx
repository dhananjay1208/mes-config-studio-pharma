import React from 'react';
import { ArrowRight, Database } from 'lucide-react';

/**
 * Horizontal production-flow visualization derived from the plant model
 * (deriveFlow selector). Shops render their stations as pills; buffers render
 * as capacity chips. Stations can be clickable (track-point / inspection
 * placement) and can carry badges.
 *
 * props:
 *  flow                 result of deriveFlow(config)
 *  onStationClick(st)   optional — makes stations interactive
 *  stationBadges        { [stationId]: [{ key, label, className }] }
 *  selectedStationId
 *  compact              smaller pills (for embedding in module screens)
 */
export default function FlowStrip({ flow, onStationClick, stationBadges = {}, selectedStationId, compact = false }) {
  if (!flow.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 p-4 text-center text-xs text-slate-600">
        No flow to display yet — model areas, lines and stations in the Plant Modeler.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max items-stretch gap-1.5">
        {flow.map((step, i) => (
          <React.Fragment key={step.kind === 'shop' ? step.area.id : step.node.id}>
            {i > 0 && (
              <div className="flex items-center text-slate-700">
                <ArrowRight className="h-4 w-4" />
              </div>
            )}
            {step.kind === 'shop' ? (
              <div className="rounded-xl border border-slate-700/70 bg-plant-900 px-2.5 py-2">
                <div className="mb-1.5 flex items-baseline gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">{step.area.name}</span>
                  <span className="mono text-[9px] text-slate-600">{step.area.props.areaClass || 'unclassed'}</span>
                </div>
                <div className="flex items-center gap-1">
                  {step.stations.length === 0 && (
                    <span className="text-[10px] italic text-slate-600">no stations</span>
                  )}
                  {step.stations.map((st) => {
                    const badges = stationBadges[st.id] ?? [];
                    const selected = selectedStationId === st.id;
                    return (
                      <button
                        key={st.id}
                        disabled={!onStationClick}
                        onClick={() => onStationClick?.(st)}
                        className={`relative rounded-lg border px-2 ${compact ? 'py-1' : 'py-1.5'} text-center transition-colors ${
                          selected
                            ? 'border-violet-500 bg-violet-600/20'
                            : 'border-slate-700 bg-plant-850'
                        } ${onStationClick ? 'cursor-pointer hover:border-violet-600' : 'cursor-default'}`}
                      >
                        <div className="mono text-[10px] font-semibold text-slate-200">{st.code}</div>
                        {!compact && <div className="max-w-[72px] truncate text-[9px] text-slate-500">{st.name}</div>}
                        {badges.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                            {badges.map((b) => (
                              <span key={b.key} className={`rounded px-1 text-[8px] font-bold uppercase ${b.className}`}>
                                {b.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 bg-plant-900/50 px-2.5 py-2">
                <Database className="h-3.5 w-3.5 text-slate-500" />
                <div className="mono mt-1 text-[10px] font-semibold text-slate-300">{step.node.code}</div>
                <div className="text-[9px] text-slate-500">{step.node.props.bufferMin ?? 0} min</div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
