/** UTC ISO-8601 timestamps throughout; views format in the user's timezone. */
export type Timestamp = string;
export type ExecutionState = 'running' | 'finished' | 'failed' | 'cancelled';
export type WorkStatus = 'in_progress' | 'blocked' | 'waiting_for_review' | 'completed' | 'failed' | 'cancelled';
export type ProjectType = 'coding' | 'automation';
export type Lifecycle = 'active' | 'paused' | 'completed' | 'archived';
export interface Account { id: string; name: string; email: string; emailVerified: boolean; demo: boolean }
export interface ReportingPolicy { staleThresholdMinutes: number; heartbeatExpected: boolean; instructions: string }
export interface ProjectInput {
  name: string; description: string; type: ProjectType; lifecycle: Lifecycle;
  repositoryName: string | null; repositoryUrl: string | null; prdUrl: string | null;
  tags: string[]; reportingPolicy: ReportingPolicy;
}
export interface Project extends ProjectInput { id: string; ownerId: string; createdAt: Timestamp; updatedAt: Timestamp; revision: number }
export interface LogicalAgent { id: string; projectId: string; name: string; title: string; workloadType: ProjectType; createdAt: Timestamp }
export interface PrReference { number: number; title: string; url: string; repositoryName: string; primary: boolean }
export interface ToolAggregate {
  name: string; source: 'mcp' | 'native' | 'shell' | 'other'; callCount: number;
  successCount: number | null; failureCount: number | null; lastUsedAt: Timestamp | null;
  coverage: 'self_reported' | 'adapter_captured';
}
export interface RunEvent {
  id: string; runId: string; kind: 'check_in' | 'status' | 'heartbeat' | 'check_out' | 'manual_close';
  receivedAt: Timestamp; occurredAt: Timestamp | null; actorId: string;
  message: string; executionState: ExecutionState; workStatus: WorkStatus;
}
/** Full run detail is returned in list/get; null tools means absent telemetry, [] means reported empty. */
export interface Run {
  id: string; projectId: string; agentId: string; taskId: string | null; title: string; workloadType: ProjectType;
  executionState: ExecutionState; workStatus: WorkStatus; startedAt: Timestamp; finishedAt: Timestamp | null;
  lastContactAt: Timestamp; updatedAt: Timestamp; harness: string | null; model: string | null;
  message: string; completionSummary: string | null; blocker: string | null; noPrReason: string | null;
  parentRunId: string | null; childRunIds: string[]; prReferences: PrReference[];
  tools: ToolAggregate[] | null; events: RunEvent[]; revision: number;
}
export type RunMetadataPatch = Partial<Pick<Run, 'title' | 'taskId' | 'harness' | 'model' | 'completionSummary' | 'blocker' | 'noPrReason' | 'prReferences'>>;
export interface NextStep {
  id: string; projectId: string; position: number; instruction: string; done: boolean; sourceRunId: string;
  createdAt: Timestamp; updatedAt: Timestamp; revision: number;
  completionChangedBy: string | null; completionChangedAt: Timestamp | null;
}
export interface WaitingNote { projectId: string; text: string; sourceRunId: string; updatedAt: Timestamp; revision: number }
export interface ProjectNextSteps { steps: NextStep[]; waitingNote: WaitingNote | null }
/** display is a masked suffix only, never sufficient to reconstruct plaintext. No credential is stored in Phase 0. */
export interface McpToken {
  id: string; label: string; projectIds: string[]; display: string; createdAt: Timestamp;
  lastUsedAt: Timestamp | null; revokedAt: Timestamp | null;
}
export type WriteResult<T> = { status: 'saved'; value: T } | { status: 'conflict'; current: T } | { status: 'not_found' } | { status: 'invalid'; message: string };
export type TokenIssueResult = { status: 'created'; token: McpToken; plaintext: string } | { status: 'not_found' } | { status: 'invalid'; message: string };
