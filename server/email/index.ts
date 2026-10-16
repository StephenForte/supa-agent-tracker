import type { AppConfig, AuthConfig } from '../config.js';

export interface Email { to: string; subject: string; text: string; html?: string }
export interface EmailSender { sendEmail(email: Email): Promise<void> }

/** Per-app test capture; no global mailbox and no secret-bearing test stdout. */
export function createEmailSender(config: AuthConfig, nodeEnv: AppConfig['nodeEnv']): EmailSender & { captured: Email[] } {
  const captured: Email[] = [];
  return {
    captured,
    async sendEmail(email) {
      if (config.emailProvider === 'console') {
        if (nodeEnv === 'test') captured.push({ ...email });
        else if (nodeEnv === 'development') {
          if (email.subject === "You're invited to Supa Agent Tracker") console.log('Invite email suppressed; use the link shown once in the app');
          else console.log(JSON.stringify({ email }));
        }
        else console.log('Console email suppressed in production; configure Resend to deliver authentication emails');
        return;
      }
      let response: Response;
      try {
        response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: config.emailFrom, ...email }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new Error('Email delivery failed');
      }
      // Never echo provider bodies, request headers or credentials into errors.
      if (!response.ok) throw new Error('Email delivery failed');
    },
  };
}
