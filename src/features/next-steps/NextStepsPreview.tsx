import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { ErrorState } from '../../components/ui/ErrorState';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { nextStepSummary } from '../../domain/derive';
import { formatNullable, formatTimestamp } from '../../domain/format';
import { sourceAgentName } from '../../domain/next-steps/steps';
import { InstructionText } from './InstructionText';
import { stopCardActivation } from './stopCardActivation';

export interface NextStepsPreviewProps { projectId: string }

export function NextStepsPreview({ projectId }: NextStepsPreviewProps) {
  const [attempt, setAttempt] = useState(0);
  return <NextStepsPreviewBody key={attempt} projectId={projectId} onRetry={() => setAttempt(value => value + 1)} />;
}

function NextStepsPreviewBody({ projectId, onRetry }: { projectId: string; onRetry: () => void }) {
  const source = useTrackerData();
  const read = useCallback(async () => {
    const [bundle, runs, agents] = await Promise.all([source.listNextSteps(projectId), source.listRuns(projectId), source.listAgents(projectId)]);
    return { bundle, runs, agents };
  }, [source, projectId]);
  const result = useSourceQuery(source, read);
  if (result.status === 'loading') return <div role="group" aria-label="Next steps preview" data-project-id={projectId}><p className="m-0 font-semibold">Next steps preview</p><p role="status">Loading next steps…</p></div>;
  if (result.status === 'error') return <div role="group" aria-label="Next steps preview" data-project-id={projectId}><p className="m-0 font-semibold">Next steps preview</p><ErrorState message={result.error.message} onRetry={onRetry} /></div>;
  const { bundle, runs, agents } = result.data;
  const summary = nextStepSummary(bundle.steps);
  const waiting = bundle.waitingNote;
  return <div role="group" aria-label="Next steps preview" className="min-w-0" data-project-id={projectId}>
    <p className="m-0 font-semibold">Next steps preview</p>
    {summary.first ? <>
      <InstructionText instruction={summary.first.instruction} />
      <p className="text-sm text-[#526670]">Remaining: {summary.remaining}</p>
      <p className="text-sm text-[#526670]">Source agent {formatNullable(sourceAgentName(summary.first.sourceRunId, runs, agents))}{' · '}<Link to={`/projects/${projectId}?run=${encodeURIComponent(summary.first.sourceRunId)}`} aria-label={`View source run ${summary.first.sourceRunId}`} onClick={stopCardActivation} onMouseDown={stopCardActivation}>View source run</Link>{' · '}Updated {formatTimestamp(summary.first.updatedAt)}</p>
    </> : <p className="m-0">No open steps</p>}
    {waiting && <p className="text-sm text-[#526670] [overflow-wrap:anywhere]">Waiting: {waiting.text} · Source agent {formatNullable(sourceAgentName(waiting.sourceRunId, runs, agents))} · Updated {formatTimestamp(waiting.updatedAt)}</p>}
  </div>;
}
