import { BAD_TOKEN_HELP, claudeCodeConfigSnippet, codexConfigSnippet, museSetupMessage } from './clientConfig.js';

export const INTEGRATION_STATUS = 'Not connected · Not tested' as const;
export const MCP_PLACEHOLDER_URL = "https://<your tracker host>/mcp";

/** Null origin keeps the placeholder used by the demo build. */
export function deploymentMcpUrl(origin: string | null): string {
  return origin ? `${origin}/mcp` : MCP_PLACEHOLDER_URL;
}

export interface IntegrationExample {
  id: 'cursor' | 'claude-desktop' | 'grok-bot' | 'muse' | 'codex' | 'claude-code';
  name: string;
  status: typeof INTEGRATION_STATUS;
  verifiedLabel: string;
  instructions: readonly string[];
  example: string;
  docs: readonly { label: string; url: string }[];
}

/** Shared guide facts, with placeholders only; connection status is never inferred. */
export function integrationExamples(url = MCP_PLACEHOLDER_URL): readonly IntegrationExample[] {
  return [
  {
    "id": "cursor",
    "name": "Cursor",
    "status": "Not connected \u00b7 Not tested",
    "verifiedLabel": "Production-verified 2026-10-16 (P1-G2, Cursor 3.25.6)",
    "instructions": [
      "Prefer Copy Cursor config on the one-time token reveal: it pastes a complete mcpServers object with this deployment's URL and the new token. Otherwise, in ~/.cursor/mcp.json, add the server URL and headers.Authorization as shown below and merge with existing servers. Choose All my projects (including future ones) or specific projects when issuing the token.",
      "Paste the base prompt into the project\u2019s agent instructions or a Cursor rule. This placement is guidance; P1-A2 verified MCP calls, not automatic prompt loading.",
      "Cursor subagents inherited MCP tools on the parent session in P1-A2. Each still needs its own check-in and parent_run_id. Omit model when unavailable.",
      BAD_TOKEN_HELP
    ],
    "example": "{\n  \"mcpServers\": {\n    \"supa-agent-tracker\": {\n      \"url\": \"https://<your tracker host>/mcp\",\n      \"headers\": {\n        \"Authorization\": \"Bearer <YOUR_TOKEN>\"\n      }\n    }\n  }\n}",
    "docs": [
      {
        "label": "Cursor MCP",
        "url": "https://cursor.com/docs/mcp"
      },
      {
        "label": "Cursor header configuration",
        "url": "https://prod.cursor.com/help/customization/mcp"
      },
      {
        "label": "Cursor subagents",
        "url": "https://cursor.com/docs/subagents"
      },
      {
        "label": "Cursor hooks",
        "url": "https://cursor.com/docs/hooks"
      }
    ]
  },
  {
    "id": "claude-desktop",
    "name": "Claude Desktop (macOS)",
    "status": "Not connected \u00b7 Not tested",
    "verifiedLabel": "Production-verified 2026-10-16 (P1-G2)",
    "instructions": [
      "Prefer Copy Claude Desktop config on the one-time token reveal: it pastes the remote MCP URL, header name authorization, and Bearer value. Otherwise open Customize \u2192 Connectors \u2192 Add custom connector, set the remote MCP URL below, choose No sign in, and add Request header authorization with value Bearer <YOUR_TOKEN>. Choose All my projects (including future ones) or specific projects when issuing the token.",
      "Request headers are a limited beta and may be missing on your account. If absent, stop setup and report the gap; OAuth fields are not bearer-token fields. Organization-shared headers do not establish individual identity.",
      "Paste the base prompt into the conversation or project instructions. This placement is guidance; P1-A2 did not verify persistent instruction loading or Cowork subagent inheritance.",
      "No hook path is known for Claude Desktop. Rely on agent heartbeats at natural pauses; scheduled Cowork tasks cannot prove the current execution is alive. Include model only from authoritative session configuration."
    ],
    "example": "Remote MCP URL: https://<your tracker host>/mcp\nSign in: No sign in\nRequest header: authorization\nValue: Bearer <YOUR_TOKEN>",
    "docs": [
      {
        "label": "Claude connector setup",
        "url": "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp"
      },
      {
        "label": "Claude request headers",
        "url": "https://claude.com/docs/connectors/custom/add-unlisted"
      },
      {
        "label": "Claude authentication beta limitations",
        "url": "https://claude.com/docs/connectors/building/authentication"
      }
    ]
  },
  {
    "id": "grok-bot",
    "name": "Grok Bot",
    "status": "Not connected \u00b7 Not tested",
    "verifiedLabel": "Production-verified 2026-10-16 (P1-G2)",
    "instructions": [
      "Prefer Copy Grok Bot config on the one-time token reveal: it pastes the MCP URL and the token for Grok's masked secret field, which keeps the token out of chat. Use Grok's own setup; do not paste the token into the chat transcript. Choose All my projects (including future ones) or specific projects when issuing the token.",
      "Production verification on 2026-10-16 used Grok's own setup with a masked secret field and its MCP bridge (mcp-remote style, seen as 0.15.1 in P1-A2). Report a missing field rather than inventing a command.",
      "Paste the base prompt into bot instructions/settings, or provide it as a nonsecret instruction message. Persistent prompt placement was not verified in P1-A2.",
      "No hook path is known for Grok Bot. Rely on agent heartbeats at natural pauses. Routines or inbound webhooks do not prove an existing run is alive.",
      "Grok Bot presents as Cursor through mcp-remote; clientInfo is metadata only. Set harness from actual runtime knowledge and omit model when unknown. Subagent inheritance was not tested."
    ],
    "example": "Connector settings\nMCP URL: https://<your tracker host>/mcp\nMasked secret: <YOUR_TOKEN>\nObserved bridge: mcp-remote 0.15.1",
    "docs": [
      {
        "label": "Grok Bot guide",
        "url": "https://x.ai/bot/guides/grok-bot-101"
      },
      {
        "label": "Grok Bot plugin settings",
        "url": "https://cursor.com/help/grok-bot/connect-plugins"
      },
      {
        "label": "Grok Bot settings",
        "url": "https://cursor.com/docs/grok-bot/settings"
      },
      {
        "label": "Grok Bot routines",
        "url": "https://cursor.com/help/grok-bot/routines"
      }
    ]
  },
  {
    "id": "muse",
    "name": "Muse",
    "status": "Not connected \u00b7 Not tested",
    "verifiedLabel": "Production-verified 2026-10-21 (operator, Muse macOS app)",
    "instructions": [
      "There is no MCP connector screen. Ask the main Muse bot, in chat, to add a remote MCP server. Prefer Copy Muse setup message on the one-time token reveal: it asks Muse to add a server named supa-agent-tracker at this deployment's URL with API key / bearer token auth, and it says the key will be entered in the secure field, not in chat. The message does not include the token. Choose All my projects (including future ones) or specific projects when issuing the token.",
      "Muse collects the token through a masked field labelled \"API Key\". Choose the API key / bearer token option. The exact wording of Muse's auth-method choices was not recorded. Paste the token only into that field, using the Copy button at the top of the one-time reveal. Do not paste the token into the chat.",
      "Paste the base prompt, or Copy prompt for this project on this page, into Muse. This placement is guidance.",
      "No hook path is known for Muse. Rely on agent heartbeats at natural pauses.",
      "Set harness from runtime knowledge; omit model when unknown. Muse version, hooks, subagent inheritance, model identity, and the harness string Muse reports are not verified."
    ],
    "example": "",
    "docs": [
      {
        "label": "Introducing Muse, a personal AI agent",
        "url": "https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/"
      }
    ]
  },
  {
    "id": "codex",
    "name": "Codex",
    "status": "Not connected \u00b7 Not tested",
    "verifiedLabel": "Production-verified 2026-10-20 (operator, Codex desktop)",
    "instructions": [
      "Prefer Copy Codex config on the one-time token reveal: it pastes the server URL, the bearer token env var name SUPA_AGENT_TRACKER_TOKEN, and SUPA_AGENT_TRACKER_TOKEN set to the new token. In the Codex desktop app, set URL to the server URL and Bearer token env var to SUPA_AGENT_TRACKER_TOKEN, and leave Headers empty. Choose All my projects (including future ones) or specific projects when issuing the token.",
      "The CLI form is from OpenAI's Codex docs, not a live check. The desktop app, the CLI, and the IDE extension share ~/.codex/config.toml. Add [mcp_servers.supa-agent-tracker] with url and bearer_token_env_var. Codex reads SUPA_AGENT_TRACKER_TOKEN from the process environment; do not put the token value in config.toml.",
      "Paste the base prompt, or Copy prompt for this project on this page, into the Codex thread. This placement is guidance."
    ],
    "example": "",
    "docs": [
      {
        "label": "Codex MCP",
        "url": "https://learn.chatgpt.com/docs/extend/mcp"
      },
      {
        "label": "Codex configuration reference",
        "url": "https://learn.chatgpt.com/docs/config-file/config-reference"
      }
    ]
  },
  {
    "id": "claude-code",
    "name": "Claude Code",
    "status": "Not connected \u00b7 Not tested",
    "verifiedLabel": "Not yet verified",
    "instructions": [
      "Prefer Copy Claude Code command on the one-time token reveal. It runs claude mcp add with --transport http, --scope user, the server URL, and an Authorization bearer header. Choose All my projects (including future ones) or specific projects when issuing the token.",
      "Use --scope user. Without it, claude mcp add can write a project-scoped .mcp.json (--scope project), and that file would be committed with the token in it. User scope stores the server in ~/.claude.json for all of your projects and keeps the token out of the repository. This command is from the Claude Code MCP docs and has not been run against production.",
      "Paste the base prompt, or Copy prompt for this project on this page, into the Claude Code session."
    ],
    "example": "",
    "docs": [
      {
        "label": "Claude Code MCP",
        "url": "https://code.claude.com/docs/en/mcp"
      },
      {
        "label": "Claude Code MCP quickstart",
        "url": "https://code.claude.com/docs/en/mcp-quickstart"
      }
    ]
  }
].map(example => ({
  ...example,
  id: example.id as IntegrationExample['id'],
  status: INTEGRATION_STATUS,
  example: (example.id === 'codex' ? codexConfigSnippet(url, '<YOUR_TOKEN>') : example.id === 'claude-code' ? claudeCodeConfigSnippet(url, '<YOUR_TOKEN>') : example.id === 'muse' ? museSetupMessage(url) : example.example).replaceAll(MCP_PLACEHOLDER_URL, url),
}));
}

export const CURSOR_HOOK_EXAMPLE = "{\n  \"version\": 1,\n  \"hooks\": {\n    \"postToolUse\": [{ \"command\": \"node --env-file=/ABSOLUTE/PRIVATE/supa-heartbeat.env /ABSOLUTE/PATH/heartbeat.mjs\", \"timeout\": 12 }],\n    \"postToolUseFailure\": [{ \"command\": \"node --env-file=/ABSOLUTE/PRIVATE/supa-heartbeat.env /ABSOLUTE/PATH/heartbeat.mjs\", \"timeout\": 12 }]\n  }\n}";
