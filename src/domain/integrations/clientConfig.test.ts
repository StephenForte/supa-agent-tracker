import { describe, expect, it } from 'vitest';
import { claudeDesktopConfigSnippet, cursorConfigSnippet, grokBotConfigSnippet } from './clientConfig';

describe('client config snippets', () => {
  const url = 'https://tracker.example/mcp';
  const token = 'sat_demo_NOT_A_REAL_TOKEN_sample';

  it('builds a parseable Cursor mcpServers object and the other clients’ paste fields', () => {
    const cursor = JSON.parse(cursorConfigSnippet(url, token)) as { mcpServers: { 'supa-agent-tracker': { url: string; headers: { Authorization: string } } } };
    expect(cursor.mcpServers['supa-agent-tracker']).toEqual({ url, headers: { Authorization: `Bearer ${token}` } });
    expect(claudeDesktopConfigSnippet(url, token)).toBe(`Remote MCP URL: ${url}\nSign in: No sign in\nRequest header: authorization\nValue: Bearer ${token}`);
    expect(grokBotConfigSnippet(url, token)).toBe(`MCP URL: ${url}\nMasked secret: ${token}`);
  });
});
