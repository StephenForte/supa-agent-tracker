import type { Account, LogicalAgent, McpToken, NextStep, Project, Run, WaitingNote } from '../../domain/types';
export const DEMO_LIVE_RUN_IDS = ['run_1', 'run_2', 'run_10'] as const;
export interface TrackerState {
  /** Mock-only heartbeat participants; never exposed in tracker records. */
  demoLiveRunIds: string[];
  account: Account; projects: Project[]; agents: LogicalAgent[]; runs: Run[];
  steps: NextStep[]; waitingNotes: WaitingNote[]; tokens: McpToken[]; sequence: number;
}
export function seedTracker(now: number): TrackerState {
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  const project = (id: string, name: string, type: Project['type'], lifecycle: Project['lifecycle'], linked = true): Project => ({
    id, ownerId: 'usr_demo', name, description: `Simulated ${type} project for reviewing agent handoffs.`, type, lifecycle,
    repositoryName: linked ? `example-org/${id.slice(4)}` : null,
    repositoryUrl: linked ? `https://github.com/example-org/${id.slice(4)}` : null,
    prdUrl: linked ? `https://github.com/example-org/${id.slice(4)}/blob/main/docs/PRD.md` : null,
    tags: type === 'coding' ? ['product', 'phase-0'] : ['daily'],
    reportingPolicy: { staleThresholdMinutes: 15, heartbeatExpected: type === 'coding', instructions: 'Report execution state and work status separately. Self-report tool coverage honestly.' },
    isPublic: false,
    createdAt: at(-10_080), updatedAt: at(-60), revision: 1,
  });
  const projects = [project('prj_offers', 'Offers workspace', 'coding', 'active'),
    project('prj_dashboard', 'Supa dashboard — a very long project name for checking wrapping on small screens and densely populated project cards', 'coding', 'active'),
    project('prj_weather', 'Daily weather briefing', 'automation', 'active', false), project('prj_archive', 'Archived prototype', 'coding', 'archived')];
  const agents: LogicalAgent[] = [
    ['offers', 1, 'T0-11a', 'Build offers form'], ['offers', 2, 'T0-11b', 'Review accessible inputs'],
    ['dashboard', 1, 'T0-12a', 'Build status cards'], ['dashboard', 2, 'T0-12b', 'Repair legacy sorting'],
    ['weather', 1, 'Daily weather', 'Prepare morning forecast'], ['archive', 1, 'T0-09a', 'Archive prototype'],
  ].map(([short, n, name, title]) => ({ id: `agt_${short}_${n}`, projectId: `prj_${short}`, name: String(name), title: String(title), workloadType: short === 'weather' ? 'automation' : 'coding', createdAt: at(-10_080) }));
  function run(n: number, agentId: string, executionState: Run['executionState'], workStatus: Run['workStatus'], start: number, contact: number): Run {
    const agent = agents.find(item => item.id === agentId)!;
    return { id: `run_${n}`, projectId: agent.projectId, agentId, taskId: agent.workloadType === 'coding' ? agent.name : null,
      title: agent.title, workloadType: agent.workloadType, executionState, workStatus, startedAt: at(start),
      finishedAt: executionState === 'running' ? null : at(contact), lastContactAt: at(contact), updatedAt: at(contact),
      harness: agent.workloadType === 'coding' ? 'Example coding harness' : 'Scheduled bot', model: 'Example demo model',
      message: executionState === 'running' ? 'Implementation in progress.' : 'Execution ended; see the handoff.',
      completionSummary: executionState === 'running' ? null : 'Simulated execution summary for UX review.',
      blocker: workStatus === 'blocked' ? 'Waiting for repository access confirmation.' : null,
      noPrReason: agent.workloadType === 'automation' ? 'Automation does not create pull requests.' : 'Local-only demo work.',
      parentRunId: null, childRunIds: [], prReferences: [], tools: null, revision: 1,
      events: [{ id: `evt_${n}_1`, runId: `run_${n}`, kind: 'check_in', receivedAt: at(start), occurredAt: null, actorId: agentId, message: 'Run checked in.', executionState: 'running', workStatus: 'in_progress' },
        ...(executionState === 'running' ? [] : [{ id: `evt_${n}_2`, runId: `run_${n}`, kind: 'check_out' as const, receivedAt: at(contact), occurredAt: null, actorId: agentId, message: 'Run checked out.', executionState, workStatus }])],
    };
  }
  const runs = [run(1, 'agt_offers_1', 'running', 'in_progress', -90, -1), run(2, 'agt_offers_1', 'running', 'in_progress', -45, -2),
    run(3, 'agt_offers_2', 'finished', 'waiting_for_review', -180, -30), run(4, 'agt_dashboard_1', 'running', 'blocked', -150, -40),
    run(5, 'agt_dashboard_2', 'failed', 'failed', -220, -100), run(6, 'agt_archive_1', 'cancelled', 'cancelled', -2880, -2800),
    run(7, 'agt_weather_1', 'finished', 'completed', -4350, -4345), run(8, 'agt_weather_1', 'finished', 'completed', -2910, -2905),
    run(9, 'agt_weather_1', 'finished', 'completed', -1470, -1465), run(10, 'agt_offers_2', 'running', 'in_progress', -20, -1)];
  runs[0]!.childRunIds = ['run_10']; runs[9]!.parentRunId = 'run_1'; runs[3]!.model = null; runs[4]!.harness = null;
  runs[1]!.tools = [{ name: 'shell', source: 'shell', callCount: 0, successCount: 0, failureCount: 0, lastUsedAt: null, coverage: 'self_reported' }];
  runs[2]!.tools = [{ name: 'edit_file', source: 'native', callCount: 8, successCount: 7, failureCount: 1, lastUsedAt: at(-35), coverage: 'self_reported' }];
  runs[2]!.prReferences = [74, 77].map((number, index) => ({ number, title: index ? 'Follow-up validation improvements' : 'Add accessible offer inputs', url: `https://github.com/example-org/offers/pull/${number}`, repositoryName: 'example-org/offers', primary: !index }));
  runs[2]!.noPrReason = null;
  const steps: NextStep[] = [
    { id: 'step_1', projectId: 'prj_offers', position: 1, instruction: 'Review and merge PR #74 after checking the form.', sourceRunId: 'run_3', done: false, completionChangedBy: null, completionChangedAt: null },
    { id: 'step_2', projectId: 'prj_offers', position: 2, instruction: 'Confirm the preview opens on a narrow screen.', sourceRunId: 'run_1', done: true, completionChangedBy: 'usr_demo', completionChangedAt: at(-10) },
    { id: 'step_3', projectId: 'prj_dashboard', position: 1, instruction: 'Inspect the failed sorting run and approve a retry in its harness.', sourceRunId: 'run_5', done: false, completionChangedBy: null, completionChangedAt: null },
  ].map(step => ({ ...step, createdAt: at(-90), updatedAt: at(-10), revision: 1 }));
  return { demoLiveRunIds: [...DEMO_LIVE_RUN_IDS], account: { id: 'usr_demo', name: 'Demo operator', email: 'demo@example.invalid', emailVerified: true, demo: true, publicHandle: null }, projects, agents, runs, steps,
    waitingNotes: [{ projectId: 'prj_offers', text: 'T0-11a is still implementing the second form variant.', sourceRunId: 'run_1', updatedAt: at(-2), revision: 1 }],
    tokens: [1, 2].map(n => ({ id: `tok_${n}`, label: n === 1 ? 'Demo coding client' : 'Demo weather bot', allProjects: false, projectIds: [n === 1 ? 'prj_offers' : 'prj_weather'], display: `sat_demo_…FAKE_${n}`, createdAt: at(-1440), lastUsedAt: n === 1 ? at(-2) : null, revokedAt: null })), sequence: 10 };
}
