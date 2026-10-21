import { describe, expect, it } from 'vitest';
import { emptyPublicProfile, initialTimezone, profileErrors, profileInputFromFields, profileLinks, profileMessages } from './profile';

const valid = { name: 'Ada', bio: 'Computing', github: 'ada', x: 'ada_l', linkedin: 'ada-lovelace', timezone: 'UTC' };

describe('public profile fields', () => {
  it('reports a validation message for each field', () => {
    expect(profileErrors(profileInputFromFields({
      name: 'x'.repeat(61), bio: 'y'.repeat(161), github: '-nope', x: 'has space', linkedin: 'ab', timezone: 'Not/AZone',
    }))).toEqual(profileMessages);
    expect(profileErrors(valid)).toEqual({});
    expect(profileErrors(profileInputFromFields({ name: '   ', bio: '', github: '', x: '', linkedin: '', timezone: 'UTC' }))).toEqual({});
  });

  it('accepts the contract boundaries and rejects the character past each limit', () => {
    expect(profileErrors({ ...valid, name: 'a'.repeat(60), bio: 'b'.repeat(160), github: `a${'b'.repeat(38)}`, x: 'a'.repeat(15), linkedin: 'a'.repeat(100) })).toEqual({});
    expect(profileErrors({ ...valid, github: 'a'.repeat(40) }).github).toBe(profileMessages.github);
    expect(profileErrors({ ...valid, x: 'a'.repeat(16) }).x).toBe(profileMessages.x);
    expect(profileErrors({ ...valid, linkedin: 'ab' }).linkedin).toBe(profileMessages.linkedin);
    expect(profileErrors({ ...valid, timezone: 'America/Los_Angeles' })).toEqual({});
    expect(profileErrors({ ...valid, timezone: 'UTC' })).toEqual({});
  });

  it('preselects the browser zone only while the saved profile is still the UTC default', () => {
    expect(initialTimezone(emptyPublicProfile(), 'Europe/Paris')).toBe('Europe/Paris');
    expect(initialTimezone({ ...emptyPublicProfile(), name: 'Ada' }, 'Europe/Paris')).toBe('UTC');
    expect(initialTimezone({ ...emptyPublicProfile(), timezone: 'America/Los_Angeles' }, 'Europe/Paris')).toBe('America/Los_Angeles');
    expect(initialTimezone(emptyPublicProfile(), 'Not/AZone')).toBe('UTC');
  });

  it('builds social links only on the fixed hosts', () => {
    expect(profileLinks({ github: 'ada', x: 'ada_l', linkedin: 'ada-lovelace' })).toEqual([
      { label: 'GitHub', href: 'https://github.com/ada' },
      { label: 'X', href: 'https://x.com/ada_l' },
      { label: 'LinkedIn', href: 'https://www.linkedin.com/in/ada-lovelace' },
    ]);
    expect(profileLinks({ github: 'javascript:alert(1)', x: null, linkedin: null })[0]?.href).toBe('https://github.com/javascript%3Aalert(1)');
    expect(profileLinks({ github: null, x: null, linkedin: null })).toEqual([]);
  });
});
