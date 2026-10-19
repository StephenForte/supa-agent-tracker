import type { Account, LogicalAgent, McpToken, NextStep, Project, ProjectInput, ProjectNextSteps, Run, RunMetadataPatch, TokenIssueResult, WriteResult } from '../domain/types.js';
import type { PrivateNote } from '../domain/privateNotes.js';
/** Subscription functions are synchronous by React's external-store protocol; all business operations are async.
 * getSnapshot returns a stable numeric invalidation revision, never records. Lists return ALL records,
 * including archived/history; views filter/sort/page using domain functions. Returned records are detached copies.
 */
export interface ObservableSource { subscribe(listener: () => void): () => void; getSnapshot(): number;
  /** Optional query lifecycle for live polling; demo sources need no observer. */
  observe?(read: () => Promise<unknown>): () => void;
}
/** Optional live browser-account actions. Never uses MCP credentials. */
export interface BrowserAuth {
  getSession(): Promise<Account | null>;
  submit(action: 'sign-up/email' | 'sign-in/email' | 'sign-out' | 'request-password-reset' | 'reset-password' | 'change-password' | 'revoke-other-sessions', body?: Record<string, unknown>): Promise<unknown>;
  verify(token: string): Promise<void>;
}
export interface TrackerDataSource extends ObservableSource {
  auth?: BrowserAuth;
  getAccount(): Promise<Account>;
  updateAccount(input: { publicHandle?: string | null; alerts?: { blocked: boolean; stale: boolean; review: boolean } }): Promise<{ status: 'saved'; value: Account } | { status: 'conflict'; message: string } | { status: 'invalid'; message: string }>;
  listProjects(): Promise<Project[]>;
  getProject(projectId: string): Promise<Project | null>;
  createProject(input: ProjectInput): Promise<WriteResult<Project>>;
  updateProject(projectId: string, patch: Partial<ProjectInput>, expectedRevision: number): Promise<WriteResult<Project>>;
  listAgents(projectId?: string): Promise<LogicalAgent[]>;
  listRuns(projectId?: string): Promise<Run[]>;
  getRun(runId: string): Promise<Run | null>;
  updateRunMetadata(runId: string, patch: RunMetadataPatch, expectedRevision: number): Promise<WriteResult<Run>>;
  /** Only running executions may close; records a user audit event, does not mutate next steps. */
  closeRun(runId: string, outcome: 'failed' | 'cancelled', reason: string): Promise<WriteResult<Run>>;
  /** Finished runs that are not completed. No timeline event. */
  markRunDone(runId: string): Promise<WriteResult<Run>>;
  listNextSteps(projectId: string): Promise<ProjectNextSteps>;
  setNextStepDone(stepId: string, done: boolean, expectedRevision: number): Promise<WriteResult<NextStep>>;
  /** Demo only. A worker may rewrite its own instruction, never user completion or another worker's step. */
  simulateAgentStepUpdate(stepId: string, instruction: string, sourceRunId: string, expectedRevision: number): Promise<WriteResult<NextStep>>;
  listTokens(): Promise<McpToken[]>;
  createToken(input: { label: string; projectIds: string[]; allProjects?: boolean }): Promise<TokenIssueResult>;
  revokeToken(tokenId: string): Promise<WriteResult<McpToken>>;
  rotateToken(tokenId: string): Promise<TokenIssueResult>;
  /** Switches all-projects and a specific list without issuing a new plaintext. */
  updateTokenScope(tokenId: string, input: { allProjects: boolean; projectIds: string[] }): Promise<WriteResult<McpToken>>;
  resetDemo(): Promise<void>;
}
/** Not reachable through TrackerDataSource. Never pass this source into agent-facing code. */
export interface PrivateNotesSource extends ObservableSource {
  get(projectId: string): Promise<PrivateNote>;
  save(projectId: string, text: string, expectedRevision: number): Promise<WriteResult<PrivateNote>>;
}
