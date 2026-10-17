import { describe, expect, it } from 'vitest';
import { INTEGRATION_STATUS, integrationExamples } from './examples';

describe('integration examples', () => {
  it('publishes evidence and secret-free configuration for each pilot client', () => {
    const examples = integrationExamples();
    expect(examples.map(example => example.name)).toEqual(['Cursor', 'Claude Desktop (macOS)', 'Grok Bot']);
    for (const example of examples) {
      expect(example.status).toBe(INTEGRATION_STATUS);
      expect(example.status).toBe('Not connected · Not tested');
      expect(example.verifiedLabel).toBe({
        cursor: 'Production-verified 2026-10-16 (P1-G2, Cursor 3.25.6)',
        'claude-desktop': 'Production-verified 2026-10-16 (P1-G2)',
        'grok-bot': 'Production-verified 2026-10-16 (P1-G2)',
      }[example.id]);
      expect(example.example).toContain('https://<your tracker host>/mcp');
      expect(example.example).toContain('<YOUR_TOKEN>');
      expect(example.example).not.toContain('sat_');
      expect(integrationExamples('https://tracker.example/mcp').find(item => item.id === example.id)?.example).toContain('https://tracker.example/mcp');
    }
    const config = JSON.parse(examples[0]!.example) as { mcpServers: { 'supa-agent-tracker': { headers: { Authorization: string } } } };
    expect(config.mcpServers['supa-agent-tracker'].headers.Authorization).toBe('Bearer <YOUR_TOKEN>');
  });
});
