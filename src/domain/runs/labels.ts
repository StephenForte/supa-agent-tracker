import type { LogicalAgent, RunEvent, ToolAggregate } from '../types';

/** D-013 / D-016 words for timeline event kinds. The stored kind stays the raw value. */
export const eventKindLabels: Record<RunEvent['kind'], string> = {
  check_in: 'Check-in',
  status: 'Status update',
  heartbeat: 'Heartbeat',
  check_out: 'Check-out',
  manual_close: 'Manual close',
};

/** D-016 words for tool telemetry source. */
export const toolSourceLabels: Record<ToolAggregate['source'], string> = {
  mcp: 'MCP',
  native: 'Native',
  shell: 'Shell',
  other: 'Other',
};

/** Agent name, else the signed-in account's display name, else the raw id. */
export function eventActorLabel(actorId: string, agents: readonly Pick<LogicalAgent, 'id' | 'name'>[], account: { id: string; name: string } | null): string {
  const agent = agents.find(item => item.id === actorId);
  if (agent) return agent.name;
  if (account && actorId === account.id) return account.name;
  return actorId;
}
