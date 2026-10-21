import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { BAD_TOKEN_HELP, claudeCodeConfigSnippet, claudeDesktopConfigSnippet, cursorConfigSnippet, grokBotConfigSnippet, museSetupMessage } from '../../domain/integrations/clientConfig';
import { TokenReveal } from './TokenReveal';

const url = 'https://tracker.example/mcp';
const token = 'sat_live_ONE_TIME_sample';
const MUSE_TOKEN_LINE = 'Paste the token only into Muse\'s masked "API Key" field, using the Copy button at the top of this reveal.';

it('shows the setup blocks and keeps the earlier clients byte-identical', () => {
  render(<TokenReveal demo={false} plaintext={token} mcpUrl={url} onDismiss={() => {}} />);
  const value = (name: string) => (screen.getByRole('textbox', { name }) as HTMLTextAreaElement).value;
  expect(screen.getAllByRole('textbox').map(box => box.id)).toEqual([
    'demo-token-plaintext',
    'token-config-cursor-config',
    'token-config-claude-desktop-config',
    'token-config-grok-bot-config',
    'token-config-muse-setup-message',
    'token-config-codex-config',
    'token-config-claude-code-command',
  ]);
  expect(value('Cursor config')).toBe(cursorConfigSnippet(url, token));
  expect(value('Claude Desktop config')).toBe(claudeDesktopConfigSnippet(url, token));
  expect(value('Grok Bot config')).toBe(grokBotConfigSnippet(url, token));
  expect(value('Muse setup message')).toBe(museSetupMessage(url));
  expect(value('Muse setup message')).toContain(url);
  expect(value('Muse setup message')).not.toContain(token);
  expect(value('Codex config')).toContain(url);
  expect(value('Codex config')).toContain(`SUPA_AGENT_TRACKER_TOKEN=${token}`);
  expect(value('Claude Code command')).toBe(claudeCodeConfigSnippet(url, token));
  expect(value('Claude Code command')).toContain('--scope user');
  const help = screen.getByText(BAD_TOKEN_HELP);
  expect(help).toBeVisible();
  expect(help).not.toHaveTextContent(token);
  const museLine = screen.getByText(MUSE_TOKEN_LINE);
  expect(museLine).toBeVisible();
  expect(museLine).not.toHaveTextContent(token);
  expect(screen.getByRole('button', { name: 'Copy Muse setup message' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Copy Codex config' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Copy Claude Code command' })).toBeVisible();
});

it('copies the Muse setup message and leaves the token out of that paste', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<TokenReveal demo={false} plaintext={token} mcpUrl={url} onDismiss={() => {}} />);
  const message = (screen.getByRole('textbox', { name: 'Muse setup message' }) as HTMLTextAreaElement).value;
  expect(message).toBe(museSetupMessage(url));
  expect(message).not.toContain(token);
  await user.click(screen.getByRole('button', { name: 'Copy Muse setup message' }));
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(writeText).toHaveBeenCalledWith(museSetupMessage(url));
  expect(writeText.mock.calls[0]?.[0]).not.toContain(token);
});
