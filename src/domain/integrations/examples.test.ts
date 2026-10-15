import { describe, expect, it } from 'vitest';
import { INTEGRATION_STATUS, integrationExamples, UNVERIFIED_CONFIGURATION_LABEL } from './examples';

describe('integration examples', () => {
  it('publishes one unverified placeholder example for each pilot client', () => {
    const examples = integrationExamples();
    expect(examples.map(example => example.name)).toEqual(['Cursor', 'Claude Desktop (macOS)', 'Grok Bot']);
    for (const example of examples) {
      expect(example.status).toBe(INTEGRATION_STATUS);
      expect(example.status).toBe('Not connected · Not tested');
      expect(example.unverifiedLabel).toBe(UNVERIFIED_CONFIGURATION_LABEL);
      expect(example.example).toContain('<PLACEHOLDER>');
      expect(example.example).toContain('<MCP_SERVER_URL>');
      expect(example.example).toContain('<YOUR_TOKEN>');
      expect(example.example).not.toMatch(/https?:\/\//);
      expect(example.example).not.toMatch(/\b(npm|npx|pnpm|yarn|brew|curl|sudo|pip)\b/);
      expect(example.example).not.toContain('sat_');
    }
  });
});
