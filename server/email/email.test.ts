import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmailSender } from './index.js';
const message = { to: 'recipient@example.test', subject: 'Verify', text: 'token-private', html: '<p>token-private</p>' };
describe('email providers', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('captures console emails in tests and prints only in development', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sender = createEmailSender({ secret: '', emailProvider: 'console' }, 'test');
    await sender.sendEmail(message);
    expect(sender.captured).toEqual([message]); expect(log).not.toHaveBeenCalled();
    await createEmailSender({ secret: '', emailProvider: 'console' }, 'development').sendEmail(message);
    expect(log).toHaveBeenCalledWith(JSON.stringify({ email: message }));
    log.mockClear();
    await createEmailSender({ secret: '', emailProvider: 'console' }, 'production').sendEmail(message);
    expect(JSON.stringify(log.mock.calls)).not.toContain(message.text);
  });
  it('uses Resend fetch and never includes provider secrets or response bodies in errors', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('provider-private-api-key', { status: 400 }));
    vi.stubGlobal('fetch', fetcher);
    const sender = createEmailSender({ secret: '', emailProvider: 'resend', resendApiKey: 'resend-private-key', emailFrom: 'sender@example.test' }, 'production');
    await expect(sender.sendEmail(message)).rejects.toThrow(/^Email delivery failed$/);
    expect(fetcher).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer resend-private-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'sender@example.test', ...message }) }));
    fetcher.mockRejectedValue(new Error('resend-private-key'));
    await expect(sender.sendEmail(message)).rejects.toThrow(/^Email delivery failed$/);
    fetcher.mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(sender.sendEmail(message)).resolves.toBeUndefined();
  });
});
