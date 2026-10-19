import type pg from 'pg';

import type { EmailSender } from '../email/index.js';
import type { Database } from '../repo/access.js';
import { alertDigestFailureLine, alertDigestSummary, runAlertDigestCycle } from './digest.js';

/** About a minute after boot, then every five minutes. Not environment settings. */
export const ALERT_BOOT_DELAY_MS = 60_000;
export const ALERT_INTERVAL_MS = 5 * 60_000;

let activeSchedulers = 0;

/** Schedulers started and not yet stopped. Importing this module does not start one. */
export function alertDigestActive(): number {
  return activeSchedulers;
}

/** Timers are unref'd so they do not keep the process alive, and stop() clears them. */
export function startAlertDigest(input: {
  pool: pg.Pool;
  db: Database;
  sender: EmailSender;
  publicUrl: string;
  now?: () => Date;
  bootDelayMs?: number;
  intervalMs?: number;
  log?: (line: string) => void;
  logError?: (line: string) => void;
}): { stop: () => void } {
  const now = input.now ?? (() => new Date());
  const log = input.log ?? ((line: string) => { console.log(line); });
  const logError = input.logError ?? ((line: string) => { console.error(line); });
  let stopped = false;
  let running = false;
  activeSchedulers += 1;
  const run = () => {
    if (stopped || running) return;
    running = true;
    void runAlertDigestCycle({ pool: input.pool, db: input.db, sender: input.sender, publicUrl: input.publicUrl, now: now() })
      .then((result) => { if (!stopped) log(alertDigestSummary(result)); })
      .catch((error: unknown) => { if (!stopped) logError(alertDigestFailureLine(error)); })
      .finally(() => { running = false; });
  };
  const boot = setTimeout(run, input.bootDelayMs ?? ALERT_BOOT_DELAY_MS);
  const interval = setInterval(run, input.intervalMs ?? ALERT_INTERVAL_MS);
  boot.unref();
  interval.unref();
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      activeSchedulers -= 1;
      clearTimeout(boot);
      clearInterval(interval);
    },
  };
}
