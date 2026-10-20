import { describe, expect, it } from 'vitest';
import { claudeCodeConfigSnippet, claudeDesktopConfigSnippet, codexConfigSnippet, cursorConfigSnippet, grokBotConfigSnippet } from './clientConfig';

describe('client config snippets', () => {
  const url = 'https://tracker.example/mcp';
  const token = 'sat_demo_NOT_A_REAL_TOKEN_sample';

  it('builds a parseable Cursor mcpServers object and the other clients’ paste fields', () => {
    const cursor = JSON.parse(cursorConfigSnippet(url, token)) as { mcpServers: { 'supa-agent-tracker': { url: string; headers: { Authorization: string } } } };
    expect(cursor.mcpServers['supa-agent-tracker']).toEqual({ url, headers: { Authorization: `Bearer ${token}` } });
    expect(claudeDesktopConfigSnippet(url, token)).toBe(`Remote MCP URL: ${url}\nSign in: No sign in\nRequest header: authorization\nValue: Bearer ${token}`);
    expect(grokBotConfigSnippet(url, token)).toBe(`MCP URL: ${url}\nMasked secret: ${token}`);
  });

  it('keeps the Cursor, Claude Desktop and Grok Bot blocks byte-identical', () => {
    expect(cursorConfigSnippet(url, token)).toBe(`{\n  "mcpServers": {\n    "supa-agent-tracker": {\n      "url": "${url}",\n      "headers": {\n        "Authorization": "Bearer ${token}"\n      }\n    }\n  }\n}`);
    expect(claudeDesktopConfigSnippet(url, token)).toBe(`Remote MCP URL: ${url}\nSign in: No sign in\nRequest header: authorization\nValue: Bearer ${token}`);
    expect(grokBotConfigSnippet(url, token)).toBe(`MCP URL: ${url}\nMasked secret: ${token}`);
  });

  it('puts the URL and plaintext in the Codex and Claude Code blocks, with user scope', () => {
    const codex = codexConfigSnippet(url, token);
    expect(codex).toContain(`URL: ${url}`);
    expect(codex).toContain('Bearer token env var: SUPA_AGENT_TRACKER_TOKEN');
    expect(codex).toContain(`SUPA_AGENT_TRACKER_TOKEN=${token}`);
    expect(codex).toContain('[mcp_servers.supa-agent-tracker]');
    expect(codex).toContain(`url = "${url}"`);
    expect(codex).toContain('bearer_token_env_var = "SUPA_AGENT_TRACKER_TOKEN"');
    expect(codex).not.toContain(`bearer_token_env_var = "${token}"`);
    const claude = claudeCodeConfigSnippet(url, token);
    expect(claude).toBe(`claude mcp add --transport http --scope user supa-agent-tracker ${url} --header "Authorization: Bearer ${token}"`);
    expect(claude).toContain('--scope user');
    expect(claude).toContain(url);
    expect(claude).toContain(token);
  });
});
