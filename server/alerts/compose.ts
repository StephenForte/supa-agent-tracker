import { alertKinds, type AlertKind, type DigestItem } from './match.js';

export const DIGEST_LIST_LIMIT = 20;

const labels: Record<AlertKind, string> = {
  blocked: 'Blocked',
  stale: 'Stale',
  review: 'Waiting for review',
};

export function digestSubject(count: number): string {
  return `Supa Agent Tracker: ${count} ${count === 1 ? 'item needs' : 'items need'} you`;
}

export function appUrl(publicUrl: string, path: string): string {
  const base = publicUrl.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

/** Keeps a title or blocker from forging another section or another item. */
function escapePlain(value: string): string {
  return [...value].map((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127 ? ' ' : character;
  }).join('').trim();
}

function minutesAgo(lastContact: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - lastContact.getTime()) / 60_000));
}

function runUrl(publicUrl: string, runId: string): string {
  return appUrl(publicUrl, `/agents?run=${encodeURIComponent(runId)}`);
}

function sortItems(items: readonly DigestItem[]): DigestItem[] {
  const rank: Record<AlertKind, number> = { blocked: 0, stale: 1, review: 2 };
  const time = (item: DigestItem) => {
    if (item.kind === 'blocked') return item.updatedAt.getTime();
    if (item.kind === 'stale') return item.lastContactAt.getTime();
    return (item.finishedAt ?? item.updatedAt).getTime();
  };
  return [...items].sort((left, right) => rank[left.kind] - rank[right.kind] || time(left) - time(right) || left.runId.localeCompare(right.runId));
}

function plainItem(item: DigestItem, now: Date, publicUrl: string): string {
  const lines = [`- ${escapePlain(item.title)} — ${escapePlain(item.agentName)} — ${escapePlain(item.projectName)}`];
  if (item.kind === 'blocked') lines.push(`  ${escapePlain(item.blocker ?? '')}`);
  if (item.kind === 'stale') lines.push(`  last contact ${minutesAgo(item.lastContactAt, now)} min ago`);
  lines.push(`  ${runUrl(publicUrl, item.runId)}`);
  return lines.join('\n');
}

function htmlItem(item: DigestItem, now: Date, publicUrl: string): string {
  const href = escapeHtml(runUrl(publicUrl, item.runId));
  const detail = item.kind === 'blocked'
    ? `<br>${escapeHtml(escapePlain(item.blocker ?? ''))}`
    : item.kind === 'stale'
      ? `<br>last contact ${minutesAgo(item.lastContactAt, now)} min ago`
      : '';
  return `<li>${escapeHtml(escapePlain(item.title))} — ${escapeHtml(escapePlain(item.agentName))} — ${escapeHtml(escapePlain(item.projectName))}${detail}<br><a href="${href}">${href}</a></li>`;
}

export function composeDigest(items: readonly DigestItem[], publicUrl: string, now: Date): { subject: string; text: string; html: string } {
  const ordered = sortItems(items);
  const listed = ordered.slice(0, DIGEST_LIST_LIMIT);
  const extra = ordered.length - listed.length;
  const needs = appUrl(publicUrl, '/needs-me');
  const settings = appUrl(publicUrl, '/settings');
  const textGroups: string[] = [];
  const htmlGroups: string[] = [];
  for (const kind of alertKinds) {
    const group = listed.filter((item) => item.kind === kind);
    if (group.length === 0) continue;
    textGroups.push(`${labels[kind]}\n${group.map((item) => plainItem(item, now, publicUrl)).join('\n')}`);
    htmlGroups.push(`<h2>${labels[kind]}</h2><ul>${group.map((item) => htmlItem(item, now, publicUrl)).join('')}</ul>`);
  }
  const moreText = extra > 0 ? `\n\nand ${extra} more` : '';
  const moreHtml = extra > 0 ? `<p>and ${extra} more</p>` : '';
  const text = `Needs me: ${needs}\n\n${textGroups.join('\n\n')}${moreText}\n\nTurn off in Account settings: ${settings}`;
  const html = `<p><a href="${escapeHtml(needs)}">Needs me</a></p>${htmlGroups.join('')}${moreHtml}<p><a href="${escapeHtml(settings)}">Turn off in Account settings</a></p>`;
  return { subject: digestSubject(ordered.length), text, html };
}
