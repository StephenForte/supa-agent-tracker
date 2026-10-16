export const INTEGRATION_STATUS = 'Not connected · Not tested' as const;
export const VERIFIED_CONFIGURATION_LABEL = "Probe-verified 2026-10-15 (P1-A2); production verification pending (P1-G2)" as const;
export const MCP_PLACEHOLDER_URL = "https://<your tracker host>/mcp";

export interface IntegrationExample {
  id: 'cursor' | 'claude-desktop' | 'grok-bot';
  name: string;
  status: typeof INTEGRATION_STATUS;
  verifiedLabel: typeof VERIFIED_CONFIGURATION_LABEL;
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
    "verifiedLabel": "Probe-verified 2026-10-15 (P1-A2); production verification pending (P1-G2)",
    "instructions": [
      "In ~/.cursor/mcp.json, add the server URL and headers.Authorization as shown below. Merge with existing servers.",
      "Paste the base prompt into the project\u2019s agent instructions or a Cursor rule. This placement is guidance; P1-A2 verified MCP calls, not automatic prompt loading.",
      "Cursor subagents inherited MCP tools on the parent session in P1-A2. Each still needs its own check-in and parent_run_id. Omit model when unavailable."
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
    "verifiedLabel": "Probe-verified 2026-10-15 (P1-A2); production verification pending (P1-G2)",
    "instructions": [
      "Open Customize \u2192 Connectors \u2192 Add custom connector. Set the remote MCP URL below, choose No sign in, and add Request header authorization with value Bearer <YOUR_TOKEN>.",
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
    "verifiedLabel": "Probe-verified 2026-10-15 (P1-A2); production verification pending (P1-G2)",
    "instructions": [
      "Use the connector settings screen to set the MCP URL below and the Authorization header value Bearer <YOUR_TOKEN>. Never enter the token through chat-driven add-server setup or paste it into chat.",
      "P1-A2 connected through an mcp-remote 0.15.1 bridge. Exact bridge installation and additional settings navigation were not recorded; use the existing connector settings path and report a missing field rather than inventing a command.",
      "Paste the base prompt into bot instructions/settings, or provide it as a nonsecret instruction message. Persistent prompt placement was not verified in P1-A2.",
      "No hook path is known for Grok Bot. Rely on agent heartbeats at natural pauses. Routines or inbound webhooks do not prove an existing run is alive.",
      "Grok Bot presents as Cursor through mcp-remote; clientInfo is metadata only. Set harness from actual runtime knowledge and omit model when unknown. Subagent inheritance was not tested."
    ],
    "example": "Connector settings\nMCP URL: https://<your tracker host>/mcp\nAuthorization: Bearer <YOUR_TOKEN>\nObserved bridge: mcp-remote 0.15.1",
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
  }
].map(example => ({ ...example, id: example.id as IntegrationExample['id'], status: INTEGRATION_STATUS, verifiedLabel: VERIFIED_CONFIGURATION_LABEL, example: example.example.replaceAll(MCP_PLACEHOLDER_URL, url) }));
}

export const CURSOR_HOOK_EXAMPLE = "{\n  \"version\": 1,\n  \"hooks\": {\n    \"postToolUse\": [{ \"command\": \"node --env-file=/ABSOLUTE/PRIVATE/supa-heartbeat.env /ABSOLUTE/PATH/heartbeat.mjs\", \"timeout\": 12 }],\n    \"postToolUseFailure\": [{ \"command\": \"node --env-file=/ABSOLUTE/PRIVATE/supa-heartbeat.env /ABSOLUTE/PATH/heartbeat.mjs\", \"timeout\": 12 }]\n  }\n}";
