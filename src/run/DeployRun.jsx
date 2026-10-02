import React, { useMemo, useState } from 'react';
import { Rocket, CircleAlert, TriangleAlert, RefreshCcw } from 'lucide-react';
import { useStudio, useStudioDispatch } from '../engine/StudioContext.jsx';
import { completeRun } from '../engine/actions.js';
import { validateConfig, findingCounts } from '../engine/validate.js';
import { deriveScheduleBank } from '../engine/scheduleCheck.js';
import { executeRun } from '../engine/execution.js';
import RunSummary from './results/RunSummary.jsx';
import ScheduleAdherence from './results/ScheduleAdherence.jsx';
import ChangeoverReport from './results/ChangeoverReport.jsx';
import ConnectivityHealth from './results/ConnectivityHealth.jsx';
import IntegrationLog from './results/IntegrationLog.jsx';
import AggregationTree from './results/AggregationTree.jsx';
import OEEWaterfall from './results/OEEWaterfall.jsx';
import QualityResults from './results/QualityResults.jsx';

const VIEWS = [
  ['summary', 'Run Summary'],
  ['schedule', 'Schedule Adherence'],
  ['changeovers', 'Changeover Report'],
  ['connectivity', 'Connectivity Health'],
  ['integration', 'Integration Log'],
  ['aggregation', 'Aggregation & Genealogy'],
  ['oee', 'OEE Waterfall'],
  ['quality', 'Quality Results'],
];

export default function DeployRun() {
  const state = useStudio();
  const dispatch = useStudioDispatch();
  const [view, setView] = useState('summary');

  const findings = useMemo(() => validateConfig(state.config), [state.config]);
  const { errors, warnings } = findingCounts(findings);
  const bank = useMemo(() => deriveScheduleBank(state.config), [state.config]);
  const run = state.lastRun;
  const stale = run && run.configUpdatedAt !== state.meta.updatedAt;

  const deploy = () => {
    const results = executeRun(state.config);
    dispatch(completeRun({
      runId: `RUN-${(run?.seqNo ?? 0) + 1}`,
      seqNo: (run?.seqNo ?? 0) + 1,
      configUpdatedAt: state.meta.updatedAt,
      results,
    }));
    setView('summary');
  };

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center gap-4 p-5">
        <Rocket className="h-7 w-7 text-violet-400" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-white">Deploy &amp; Run</h1>
          <p className="text-xs text-slate-500">
            One Wednesday at Plant 2 Lakeworth — 06:00 to 14:00. Reality is fixed; your configuration
            decides what the MES saw, held and reported.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {errors > 0 && (
            <span className="chip bg-red-900/60 text-red-300"><CircleAlert className="h-3 w-3" /> {errors} blocking</span>
          )}
          {errors === 0 && warnings > 0 && (
            <span className="chip bg-amber-900/60 text-amber-300"><TriangleAlert className="h-3 w-3" /> {warnings} warnings — will show in results</span>
          )}
          <button
            onClick={deploy}
            disabled={errors > 0 || bank.dayRuns.length === 0}
            className="btn-primary"
            title={errors > 0
              ? 'Fix blocking validation errors first'
              : bank.dayRuns.length === 0
                ? 'No released runs — map and release the Cadence APS schedule in APS Integration first'
                : undefined}
          >
            {run ? <RefreshCcw className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
            {run ? 'Re-deploy & run' : 'Deploy & run production day'}
          </button>
        </div>
        {errors === 0 && bank.dayRuns.length === 0 && (
          <p className="w-full text-[11px] text-amber-400">
            No released runs for the deploy day — map the Cadence APS schedule feed and release its runs in
            APS Integration, or the lines will stand still.
          </p>
        )}
      </div>

      {run && (
        <>
          {stale && (
            <div className="rounded-lg border border-amber-800 bg-amber-950/40 px-4 py-2 text-xs text-amber-300">
              Configuration has changed since this run — results below are from the previous deploy. Re-run to refresh.
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {VIEWS.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  view === id ? 'bg-violet-600/20 text-violet-300' : 'text-slate-500 hover:bg-plant-800 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {view === 'summary' && <RunSummary run={run.results} />}
          {view === 'schedule' && <ScheduleAdherence run={run.results} />}
          {view === 'changeovers' && <ChangeoverReport run={run.results} config={state.config} />}
          {view === 'connectivity' && <ConnectivityHealth run={run.results} />}
          {view === 'integration' && <IntegrationLog run={run.results} config={state.config} />}
          {view === 'aggregation' && <AggregationTree run={run.results} />}
          {view === 'oee' && <OEEWaterfall run={run.results} />}
          {view === 'quality' && <QualityResults run={run.results} />}
        </>
      )}
    </div>
  );
}
