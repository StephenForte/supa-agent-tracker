import { describe, expect, it } from 'vitest';
import { eventActorLabel, eventKindLabels, toolSourceLabels } from './labels';

describe('run display labels', () => {
  it('spells every event kind and tool source', () => {
    expect(eventKindLabels).toEqual({
      check_in: 'Check-in', status: 'Status update', heartbeat: 'Heartbeat', check_out: 'Check-out', manual_close: 'Manual close',
    });
    expect(toolSourceLabels).toEqual({ mcp: 'MCP', native: 'Native', shell: 'Shell', other: 'Other' });
  });
  it('names an agent, the signed-in account, or the raw id', () => {
    const agents = [{ id: 'agt_offers_2', name: 'T0-11b' }];
    const account = { id: 'usr_demo', name: 'Demo operator' };
    expect(eventActorLabel('agt_offers_2', agents, account)).toBe('T0-11b');
    expect(eventActorLabel('usr_demo', agents, account)).toBe('Demo operator');
    expect(eventActorLabel('usr_demo', agents, null)).toBe('usr_demo');
    expect(eventActorLabel('somebody_else', agents, account)).toBe('somebody_else');
  });
});
