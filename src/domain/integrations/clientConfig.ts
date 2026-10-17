/** Ready-to-paste client setup. Callers must keep the token inside the one-time reveal. */
export function cursorConfigSnippet(mcpUrl: string, token: string): string {
  return JSON.stringify({
    mcpServers: {
      'supa-agent-tracker': {
        url: mcpUrl,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  }, null, 2);
}

export function claudeDesktopConfigSnippet(mcpUrl: string, token: string): string {
  return `Remote MCP URL: ${mcpUrl}\nSign in: No sign in\nRequest header: authorization\nValue: Bearer ${token}`;
}

/** Grok's masked secret field takes the token itself, so the value never goes through chat. */
export function grokBotConfigSnippet(mcpUrl: string, token: string): string {
  return `MCP URL: ${mcpUrl}\nMasked secret: ${token}`;
}
