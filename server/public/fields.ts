/** POSIX-safe form of D-040's GitHub rule `^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$`. */
export const PUBLIC_GITHUB_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;

export const PUBLIC_X_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

export const PUBLIC_LINKEDIN_PATTERN = /^[A-Za-z0-9-]{3,100}$/;

export const PUBLIC_NAME_MAX = 60;

export const PUBLIC_BIO_MAX = 160;

const profileTimeZones = new Set(Intl.supportedValuesOf('timeZone'));

/** `UTC` or an IANA name from `Intl.supportedValuesOf('timeZone')`. */
export function isProfileTimezone(value: string): boolean {
  return value === 'UTC' || profileTimeZones.has(value);
}
