import type { PublicProfile, PublicProfileInput } from '../types.js';

export const emptyPublicProfile = (): PublicProfile => ({
  name: null, bio: null, github: null, x: null, linkedin: null, timezone: 'UTC', avatarUpdatedAt: null,
});

export const profileMessages = {
  name: 'Name must be 1–60 characters.',
  bio: 'Bio must be 1–160 characters.',
  github: 'GitHub handle must start with a letter or number and use only letters, numbers, and hyphens (up to 39 characters).',
  x: 'X handle must be 1–15 letters, numbers, or underscores.',
  linkedin: 'LinkedIn handle must be 3–100 letters, numbers, or hyphens.',
  timezone: 'Choose a supported timezone.',
} as const;

const githubPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const xPattern = /^[A-Za-z0-9_]{1,15}$/;
const linkedinPattern = /^[A-Za-z0-9-]{3,100}$/;

export function timezoneOptions(): string[] {
  return ['UTC', ...Intl.supportedValuesOf('timeZone').filter(zone => zone !== 'UTC')];
}

export function isAllowedTimezone(value: string): boolean {
  return value === 'UTC' || Intl.supportedValuesOf('timeZone').includes(value);
}

export function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

const socialHosts = {
  github: ['github.com'],
  x: ['x.com', 'twitter.com'],
  linkedin: ['linkedin.com'],
} as const;

function stripOneLeadingAt(value: string): string {
  return value.startsWith('@') ? value.slice(1) : value;
}

function decodePathSegment(segment: string): string {
  try { return decodeURIComponent(segment); }
  catch { return segment; }
}

/** One optional www. prefix. A lookalike host such as github.com.evil.example stays intact. */
function canonicalHost(hostname: string): string {
  const host = hostname.toLowerCase();
  return host.startsWith('www.') ? host.slice(4) : host;
}

function profileUrl(value: string): URL | null {
  const withScheme = /^https?:\/\//i.test(value)
    ? value
    : /^(?:www\.)?(?:github\.com|x\.com|twitter\.com|linkedin\.com)\//i.test(value)
      ? `https://${value}`
      : null;
  if (!withScheme) return null;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

/** A profile URL is exactly github.com/<h>, x.com/<h>, twitter.com/<h>, or linkedin.com/in/<h>. */
function handleFromProfileUrl(field: keyof typeof socialHosts, value: string): string | null {
  const url = profileUrl(value);
  if (!url) return null;
  const host = canonicalHost(url.hostname);
  const allowed: readonly string[] = socialHosts[field];
  if (!allowed.includes(host)) return null;
  const segments = url.pathname.split('/').filter(segment => segment.length > 0).map(decodePathSegment);
  if (field === 'linkedin') {
    if (segments.length !== 2 || segments[0]?.toLowerCase() !== 'in') return null;
    return segments[1] || null;
  }
  if (segments.length !== 1) return null;
  return segments[0] || null;
}

/** Trim, drop one leading @, and take a handle only from that field's own profile host. */
export function normalizeSocialHandle(field: keyof typeof socialHosts, value: string): string {
  const trimmed = stripOneLeadingAt(value.trim());
  const fromUrl = handleFromProfileUrl(field, trimmed);
  return fromUrl === null ? trimmed : stripOneLeadingAt(fromUrl);
}

export function profileInputFromFields(fields: { name: string; bio: string; github: string; x: string; linkedin: string; timezone: string }): PublicProfileInput {
  return {
    name: blankToNull(fields.name),
    bio: blankToNull(fields.bio),
    github: blankToNull(normalizeSocialHandle('github', fields.github)),
    x: blankToNull(normalizeSocialHandle('x', fields.x)),
    linkedin: blankToNull(normalizeSocialHandle('linkedin', fields.linkedin)),
    timezone: fields.timezone,
  };
}

export function profileErrors(input: PublicProfileInput): Partial<Record<keyof PublicProfileInput, string>> {
  const errors: Partial<Record<keyof PublicProfileInput, string>> = {};
  if (input.name !== null && (input.name.length < 1 || input.name.length > 60)) errors.name = profileMessages.name;
  if (input.bio !== null && (input.bio.length < 1 || input.bio.length > 160)) errors.bio = profileMessages.bio;
  if (input.github !== null && !githubPattern.test(input.github)) errors.github = profileMessages.github;
  if (input.x !== null && !xPattern.test(input.x)) errors.x = profileMessages.x;
  if (input.linkedin !== null && !linkedinPattern.test(input.linkedin)) errors.linkedin = profileMessages.linkedin;
  if (!isAllowedTimezone(input.timezone)) errors.timezone = profileMessages.timezone;
  return errors;
}

export function profileErrorMessage(input: PublicProfileInput): string | null {
  return Object.values(profileErrors(input))[0] ?? null;
}

/** Browser zone only while the saved profile is still the untouched UTC default. */
export function initialTimezone(profile: PublicProfile, browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const untouched = profile.timezone === 'UTC'
    && profile.name == null && profile.bio == null && profile.github == null
    && profile.x == null && profile.linkedin == null && profile.avatarUpdatedAt == null;
  if (untouched && isAllowedTimezone(browserZone)) return browserZone;
  return isAllowedTimezone(profile.timezone) ? profile.timezone : 'UTC';
}

export function profileInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

/** Fixed hosts only. The stored handle is a path segment, never an href. */
export function profileLinks(links: { github: string | null; x: string | null; linkedin: string | null }): { label: 'GitHub' | 'X' | 'LinkedIn'; href: string }[] {
  const items: { label: 'GitHub' | 'X' | 'LinkedIn'; href: string }[] = [];
  if (links.github) items.push({ label: 'GitHub', href: `https://github.com/${encodeURIComponent(links.github)}` });
  if (links.x) items.push({ label: 'X', href: `https://x.com/${encodeURIComponent(links.x)}` });
  if (links.linkedin) items.push({ label: 'LinkedIn', href: `https://www.linkedin.com/in/${encodeURIComponent(links.linkedin)}` });
  return items;
}
