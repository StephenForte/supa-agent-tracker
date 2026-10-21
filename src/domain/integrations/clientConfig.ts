/** Ready-to-paste client setup. Callers must keep the token inside the one-time reveal. */
export const CODEX_TOKEN_ENV_VAR = 'SUPA_AGENT_TRACKER_TOKEN';

/** Shown on the token reveal and the Cursor guide. Bearer-only: do not send the user through OAuth. */
export const BAD_TOKEN_HELP = 'If Cursor (or another client) shows an Authenticate or Sign in button for this server, the token is wrong or revoked. Don\'t sign in. Create a new token here and replace it in the client config.';

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

/**
 * Chat paste for Muse (D-041). The token is not a parameter: Muse collects it
 * in a masked API Key field, and a message that included it would land in the transcript.
 */
export function museSetupMessage(mcpUrl: string): string {
  return `Please add a remote MCP server named supa-agent-tracker at ${mcpUrl}. Choose the API key / bearer token option. I will enter the key in the masked "API Key" field, not in this chat.`;
}

/**
 * Desktop form fields plus the CLI table from OpenAI's Codex docs.
 * The token value belongs in the environment, not in config.toml.
 */
export function codexConfigSnippet(mcpUrl: string, token: string): string {
  return `URL: ${mcpUrl}
Bearer token env var: ${CODEX_TOKEN_ENV_VAR}
${CODEX_TOKEN_ENV_VAR}=${token}

The desktop app and the CLI read ${CODEX_TOKEN_ENV_VAR} from the Codex process environment. They share ~/.codex/config.toml. For the CLI, add [mcp_servers.supa-agent-tracker] with url and bearer_token_env_var. Do not put the token value in that file.

[mcp_servers.supa-agent-tracker]
url = "${mcpUrl}"
bearer_token_env_var = "${CODEX_TOKEN_ENV_VAR}"`;
}

/** User scope keeps the bearer token out of a project .mcp.json. */
export function claudeCodeConfigSnippet(mcpUrl: string, token: string): string {
  return `claude mcp add --transport http --scope user supa-agent-tracker ${mcpUrl} --header "Authorization: Bearer ${token}"`;
}
