export const INTEGRATION_STATUS = 'Not connected · Not tested' as const;
export const UNVERIFIED_CONFIGURATION_LABEL = 'Unverified — not a working configuration' as const;

export interface IntegrationExample {
  id: 'cursor' | 'claude-desktop' | 'grok-bot';
  name: string;
  status: typeof INTEGRATION_STATUS;
  unverifiedLabel: typeof UNVERIFIED_CONFIGURATION_LABEL;
  example: string;
}

function placeholderExample(shape: string): string {
  return [
    '{',
    `  "<PLACEHOLDER>": "${shape}",`,
    '  "url": "<MCP_SERVER_URL>",',
    '  "authorization": "Bearer <YOUR_TOKEN>"',
    '}',
  ].join('\n');
}

/** Pilot clients only. Every value is an obvious placeholder. Nothing here is an install command. */
export function integrationExamples(): readonly IntegrationExample[] {
  return [
    { id: 'cursor', name: 'Cursor', status: INTEGRATION_STATUS, unverifiedLabel: UNVERIFIED_CONFIGURATION_LABEL, example: placeholderExample('<CURSOR_MCP_ENTRY>') },
    { id: 'claude-desktop', name: 'Claude Desktop (macOS)', status: INTEGRATION_STATUS, unverifiedLabel: UNVERIFIED_CONFIGURATION_LABEL, example: placeholderExample('<CLAUDE_DESKTOP_MCP_ENTRY>') },
    { id: 'grok-bot', name: 'Grok Bot', status: INTEGRATION_STATUS, unverifiedLabel: UNVERIFIED_CONFIGURATION_LABEL, example: placeholderExample('<GROK_BOT_MCP_ENTRY>') },
  ];
}
