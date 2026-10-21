export interface PublicRun {
  title: string;
  executionState: 'running' | 'finished' | 'failed' | 'cancelled';
  workStatus: 'in_progress' | 'blocked' | 'waiting_for_review' | 'completed' | 'failed' | 'cancelled';
  stale: boolean;
  harness: string | null;
  startedAt: string;
  lastContactAt: string;
  finishedAt: string | null;
}
export interface PublicAgent { name: string; runs: PublicRun[] }
export interface PublicProject { name: string; agents: PublicAgent[] }
export interface PublicAgentsPayload { owner: { handle: string }; projects: PublicProject[] }
export type PublicAgentsResult = PublicAgentsPayload | 'missing';
export type PublicAgentsLoader = (handle: string) => Promise<PublicAgentsResult>;

/** D-040 public profile. activity and harness dates are YYYY-MM-DD in the owner's profile timezone. */
export interface PublicProfilePayload {
  owner: {
    handle: string; name: string | null; bio: string | null;
    links: { github: string | null; x: string | null; linkedin: string | null };
    joinedAt: string; avatarUrl: string | null;
  };
  stats: { agentRuns: number; longestRunSeconds: number; currentStreakDays: number; longestStreakDays: number };
  activity: { start: string; end: string; counts: number[] };
  harnesses: { start: string; end: string; series: { harness: string; counts: number[] }[] };
}
export type PublicProfileResult = PublicProfilePayload | 'missing';
export type PublicProfileLoader = (handle: string) => Promise<PublicProfileResult>;
