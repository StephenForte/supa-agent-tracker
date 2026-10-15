import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ErrorState } from '../../components/ui/ErrorState';
import { Button } from '../../components/ui/Button';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { formatNullable, formatTimestamp } from '../../domain/format';
import { completedSteps, completionActorLabel, openSteps, orderedSteps, simulatedInstructionRewrite, sourceAgentName, staleRevision } from '../../domain/next-steps/steps';
import type { Account, LogicalAgent, NextStep, Run, WaitingNote } from '../../domain/types';
import { InstructionText } from './InstructionText';
import { stopCardActivation } from './stopCardActivation';

export interface NextStepsPanelProps { projectId: string }

function sourceRunPath(projectId: string, runId: string): string {
  return `/projects/${projectId}?run=${encodeURIComponent(runId)}`;
}

export function NextStepsPanel({ projectId }: NextStepsPanelProps) {
  const [attempt, setAttempt] = useState(0);
  return <NextStepsBody key={attempt} projectId={projectId} onRetry={() => setAttempt(value => value + 1)} />;
}

function NextStepsBody({ projectId, onRetry }: { projectId: string; onRetry: () => void }) {
  const source = useTrackerData();
  const headingId = useId();
  const selectId = useId();
  const read = useCallback(async () => {
    const [bundle, runs, agents, account] = await Promise.all([
      source.listNextSteps(projectId), source.listRuns(projectId), source.listAgents(projectId), source.getAccount(),
    ]);
    return { bundle, runs, agents, account };
  }, [source, projectId]);
  const result = useSourceQuery(source, read);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userHold, setUserHold] = useState<{ id: string; revision: number } | null>(null);
  const [userConflict, setUserConflict] = useState<{ intent: boolean; current: NextStep } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [demoHold, setDemoHold] = useState<{ id: string; revision: number } | null>(null);
  const [demoMessage, setDemoMessage] = useState<string | null>(null);
  const [demoInstruction, setDemoInstruction] = useState<string | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const loaded = result.status === 'ready' ? result.data : null;
  const refreshing = result.status === 'ready' && result.refreshing;
  // The query keeps the previous steps while it refreshes. Drop the hold only
  // once that snapshot shows a new revision, so a second click cannot write
  // with the revision the first save already consumed.
  const snapshotCaughtUp = (hold: { id: string; revision: number } | null) => {
    if (!hold || !loaded || refreshing) return false;
    const step = loaded.bundle.steps.find(item => item.id === hold.id);
    return !step || step.revision !== hold.revision;
  };
  if (snapshotCaughtUp(userHold)) setUserHold(null);
  if (snapshotCaughtUp(demoHold)) setDemoHold(null);
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id || userHold || demoHold) return;
    pendingFocus.current = null;
    document.getElementById(`step-${projectId}-${id}`)?.focus();
  }, [loaded, projectId, userHold, demoHold]);

  if (result.status === 'loading') return <section className="slot min-w-0" aria-labelledby={headingId} data-project-id={projectId}><h2 id={headingId}>Agent next steps</h2><p role="status">Loading next steps…</p></section>;
  if (result.status === 'error') return <section className="slot min-w-0" aria-labelledby={headingId} data-project-id={projectId}><h2 id={headingId}>Agent next steps</h2><ErrorState message={result.error.message} onRetry={onRetry} /></section>;

  const { bundle, runs, agents, account } = result.data;
  const open = openSteps(bundle.steps);
  const completed = completedSteps(bundle.steps);
  const preferredId = completed[0]?.id ?? open[0]?.id ?? null;
  if (selectedId === null && preferredId !== null) setSelectedId(preferredId);
  const selected = orderedSteps(bundle.steps).find(step => step.id === selectedId) ?? null;
  const busy = userHold !== null || demoHold !== null;

  async function toggle(step: NextStep) {
    const desired = !step.done;
    pendingFocus.current = step.id;
    setUserHold({ id: step.id, revision: step.revision });
    setActionError(null);
    setUserConflict(null);
    const before = source.getSnapshot();
    const outcome = await source.setNextStepDone(step.id, desired, step.revision);
    if (source.getSnapshot() === before) pendingFocus.current = null;
    if (outcome.status === 'conflict') {
      const fresh = await source.listNextSteps(projectId);
      setUserConflict({ intent: desired, current: fresh.steps.find(item => item.id === step.id) ?? outcome.current });
      setUserHold(null);
    } else if (outcome.status === 'saved') setUserConflict(null);
    else {
      setActionError(outcome.status === 'invalid' ? outcome.message : 'That step could not be found.');
      setUserHold(null);
    }
  }

  async function retryConflict() {
    if (!userConflict) return;
    const { intent, current } = userConflict;
    pendingFocus.current = current.id;
    setUserHold({ id: current.id, revision: current.revision });
    setActionError(null);
    const before = source.getSnapshot();
    const outcome = await source.setNextStepDone(current.id, intent, current.revision);
    if (source.getSnapshot() === before) pendingFocus.current = null;
    if (outcome.status === 'conflict') {
      const fresh = await source.listNextSteps(projectId);
      setUserConflict({ intent, current: fresh.steps.find(item => item.id === current.id) ?? outcome.current });
      setUserHold(null);
    } else if (outcome.status === 'saved') setUserConflict(null);
    else {
      setActionError(outcome.status === 'invalid' ? outcome.message : 'That step could not be found.');
      setUserHold(null);
    }
  }

  async function simulate(step: NextStep, kind: 'current' | 'stale') {
    setDemoHold({ id: step.id, revision: step.revision });
    setDemoMessage(null);
    setDemoInstruction(null);
    setActionError(null);
    const expected = kind === 'current' ? step.revision : staleRevision(step.revision);
    const outcome = await source.simulateAgentStepUpdate(step.id, simulatedInstructionRewrite(step.instruction, step.revision), step.sourceRunId, expected);
    if (outcome.status === 'saved') {
      const completion = outcome.value.done === step.done ? 'Completion state was left unchanged.' : 'Completion state changed.';
      setDemoMessage(`The source run rewrote the instruction using the current revision. ${completion}`);
    } else if (outcome.status === 'conflict') {
      const fresh = await source.listNextSteps(projectId);
      const current = fresh.steps.find(item => item.id === step.id) ?? outcome.current;
      setDemoMessage('This update used a stale revision. The agent must re-read and reconcile. Nothing was overwritten.');
      setDemoInstruction(current.instruction);
      setDemoHold(null);
    } else {
      setDemoMessage(outcome.status === 'invalid' ? outcome.message : 'That step could not be found.');
      setDemoHold(null);
    }
  }

  return <section className="slot min-w-0" aria-labelledby={headingId} data-project-id={projectId}>
    <h2 id={headingId}>Agent next steps</h2>
    <p className="text-sm text-[#526670]">Instructions are written by agents. You can mark them done or reopen them. Checking an item does not run anything.</p>
    {bundle.waitingNote && <WaitingNoteView note={bundle.waitingNote} projectId={projectId} runs={runs} agents={agents} />}
    {userConflict && <div role="alert" className="mt-4 rounded-md border border-[#d9b86b] bg-[#fff0cb] p-3">
      <p>This step changed before your update was saved. Nothing was overwritten. Re-read the current step and retry.</p>
      <p>You wanted to {userConflict.intent ? 'mark this step done' : 'reopen this step'}.</p>
      <p>Current instruction:</p>
      <InstructionText instruction={userConflict.current.instruction} />
      <p>Current completion: {userConflict.current.done ? 'Completed' : 'Open'}.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void retryConflict()} disabled={busy}>Retry</Button>
        <Button onClick={() => setUserConflict(null)} disabled={busy}>Dismiss</Button>
      </div>
    </div>}
    {actionError && <p role="alert">{actionError}</p>}
    <h3 className="mt-4 text-base">Open</h3>
    {open.length === 0 ? <p>No open steps</p> : <ul className="m-0 list-none p-0">{open.map(step => <StepRow key={step.id} step={step} projectId={projectId} runs={runs} agents={agents} account={account} pending={busy} onToggle={stepToToggle => void toggle(stepToToggle)} />)}</ul>}
    {completed.length > 0 && <>
      <h3 className="mt-4 text-base">Completed</h3>
      <ul className="m-0 list-none p-0">{completed.map(step => <StepRow key={step.id} step={step} projectId={projectId} runs={runs} agents={agents} account={account} pending={busy} onToggle={stepToToggle => void toggle(stepToToggle)} />)}</ul>
    </>}
    <fieldset className="mt-6 min-w-0 rounded-md border border-[#d9b86b] bg-[#fff0cb] p-4">
      <legend className="px-1 font-semibold">Demo only — Simulate agent update</legend>
      <p>Instruction text is not editable. These controls pretend the source run rewrote a step. They are not part of normal use.</p>
      {selected ? <>
        <label htmlFor={selectId} className="text-sm font-semibold">Step to update</label>
        <select id={selectId} className="mt-1 w-full max-w-full rounded-md border border-[#9aabb2] bg-white p-2" value={selected.id} onChange={event => setSelectedId(event.target.value)}>
          {orderedSteps(bundle.steps).map(step => <option key={step.id} value={step.id}>{step.position}. {step.done ? 'Completed' : 'Open'} — {step.instruction}</option>)}
        </select>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => void simulate(selected, 'current')} disabled={busy}>Rewrite with the current revision</Button>
          <Button onClick={() => void simulate(selected, 'stale')} disabled={busy}>Send a stale revision</Button>
        </div>
      </> : <p>No steps to update.</p>}
      {demoMessage && <div role="status"><p>{demoMessage}</p>{demoInstruction !== null && <InstructionText instruction={demoInstruction} />}</div>}
    </fieldset>
  </section>;
}

function WaitingNoteView({ note, projectId, runs, agents }: { note: WaitingNote; projectId: string; runs: readonly Run[]; agents: readonly LogicalAgent[] }) {
  return <aside className="mt-4 rounded-md bg-[#fff0d3] p-3" aria-label="Waiting note">
    <h3 className="text-base">Waiting</h3>
    <p>{note.text}</p>
    <p className="text-sm text-[#526670]">Source agent {formatNullable(sourceAgentName(note.sourceRunId, runs, agents))}{' · '}<SourceRunLink projectId={projectId} runId={note.sourceRunId} />{' · '}Updated {formatTimestamp(note.updatedAt)}</p>
  </aside>;
}

function StepRow({ step, projectId, runs, agents, account, pending, onToggle }: {
  step: NextStep; projectId: string; runs: readonly Run[]; agents: readonly LogicalAgent[]; account: Account; pending: boolean; onToggle: (step: NextStep) => void;
}) {
  return <li className="min-w-0 border-t border-[#d6e0e3] py-3">
    <div className="flex min-w-0 items-start gap-3">
      <input id={`step-${projectId}-${step.id}`} className="mt-1 size-5 shrink-0" type="checkbox" checked={step.done} disabled={pending} aria-label={`${step.done ? 'Reopen' : 'Mark done'}: ${step.instruction}`} onChange={() => onToggle(step)} />
      <div className="min-w-0">
        <InstructionText instruction={step.instruction} />
        <p className="text-sm text-[#526670]">Source agent {formatNullable(sourceAgentName(step.sourceRunId, runs, agents))}{' · '}<SourceRunLink projectId={projectId} runId={step.sourceRunId} />{' · '}Updated {formatTimestamp(step.updatedAt)}</p>
        {step.done && <p className="text-sm text-[#526670]">Completed by {formatNullable(completionActorLabel(step.completionChangedBy, account))} · {formatTimestamp(step.completionChangedAt)}</p>}
      </div>
    </div>
  </li>;
}

function SourceRunLink({ projectId, runId }: { projectId: string; runId: string }) {
  return <Link to={sourceRunPath(projectId, runId)} aria-label={`View source run ${runId}`} onClick={stopCardActivation} onMouseDown={stopCardActivation}>View source run</Link>;
}
