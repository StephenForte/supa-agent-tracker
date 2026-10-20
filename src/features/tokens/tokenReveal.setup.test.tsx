import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { BAD_TOKEN_HELP, claudeCodeConfigSnippet, claudeDesktopConfigSnippet, cursorConfigSnippet, grokBotConfigSnippet } from '../../domain/integrations/clientConfig';
import { TokenReveal } from './TokenReveal';

const url = 'https://tracker.example/mcp';
const token = 'sat_live_ONE_TIME_sample';

it('shows five setup blocks and keeps the original three byte-identical', () => {
  render(<TokenReveal demo={false} plaintext={token} mcpUrl={url} onDismiss={() => {}} />);
  const value = (name: string) => (screen.getByRole('textbox', { name }) as HTMLTextAreaElement).value;
  expect(value('Cursor config')).toBe(cursorConfigSnippet(url, token));
  expect(value('Claude Desktop config')).toBe(claudeDesktopConfigSnippet(url, token));
  expect(value('Grok Bot config')).toBe(grokBotConfigSnippet(url, token));
  expect(value('Codex config')).toContain(url);
  expect(value('Codex config')).toContain(`SUPA_AGENT_TRACKER_TOKEN=${token}`);
  expect(value('Claude Code command')).toBe(claudeCodeConfigSnippet(url, token));
  expect(value('Claude Code command')).toContain('--scope user');
  const help = screen.getByText(BAD_TOKEN_HELP);
  expect(help).toBeVisible();
  expect(help).not.toHaveTextContent(token);
  expect(screen.getByRole('button', { name: 'Copy Codex config' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Copy Claude Code command' })).toBeVisible();
});
