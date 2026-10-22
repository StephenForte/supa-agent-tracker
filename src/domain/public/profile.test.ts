import { describe, expect, it } from 'vitest';
import { emptyPublicProfile, initialTimezone, normalizeSocialHandle, profileErrors, profileInputFromFields, profileLinks, profileMessages } from './profile';

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

  it('turns a leading @ or a matching profile URL into a bare handle and leaves every other URL alone', () => {
    expect(normalizeSocialHandle('x', '@jack')).toBe('jack');
    expect(normalizeSocialHandle('x', '  @jack  ')).toBe('jack');
    expect(normalizeSocialHandle('x', '@@jack')).toBe('@jack');
    expect(normalizeSocialHandle('x', '@')).toBe('');
    expect(normalizeSocialHandle('github', 'https://github.com/octocat/')).toBe('octocat');
    expect(normalizeSocialHandle('github', 'http://www.github.com/OctoCat')).toBe('OctoCat');
    expect(normalizeSocialHandle('github', 'github.com/octocat')).toBe('octocat');
    expect(normalizeSocialHandle('github', 'https://github.com/octocat#readme')).toBe('octocat');
    expect(normalizeSocialHandle('linkedin', 'https://www.linkedin.com/in/jane-doe/?trk=x')).toBe('jane-doe');
    expect(normalizeSocialHandle('linkedin', 'https://linkedin.com/in/jane-doe/')).toBe('jane-doe');
    expect(normalizeSocialHandle('x', 'https://twitter.com/jack')).toBe('jack');
    expect(normalizeSocialHandle('x', 'https://x.com/@jack')).toBe('jack');
    expect(normalizeSocialHandle('x', 'https://www.x.com/jack?s=20')).toBe('jack');
    expect(normalizeSocialHandle('github', 'https://gitlab.com/octocat')).toBe('https://gitlab.com/octocat');
    expect(normalizeSocialHandle('github', 'https://evil.example/octocat')).toBe('https://evil.example/octocat');
    expect(normalizeSocialHandle('x', 'https://github.com/octocat')).toBe('https://github.com/octocat');
    expect(normalizeSocialHandle('linkedin', 'https://www.linkedin.com/company/acme')).toBe('https://www.linkedin.com/company/acme');
    expect(normalizeSocialHandle('github', 'https://github.com/octocat/repo')).toBe('https://github.com/octocat/repo');
    const gitlab = profileInputFromFields({ name: '', bio: '', github: 'https://gitlab.com/octocat', x: '', linkedin: '', timezone: 'UTC' });
    expect(gitlab.github).toBe('https://gitlab.com/octocat');
    expect(profileErrors(gitlab).github).toBe(profileMessages.github);
    expect(profileInputFromFields({
      name: '', bio: '', github: 'https://github.com/octocat/', x: '@jack', linkedin: 'https://www.linkedin.com/in/jane-doe/?trk=x', timezone: 'UTC',
    })).toMatchObject({ github: 'octocat', x: 'jack', linkedin: 'jane-doe' });
    expect(profileLinks({ github: normalizeSocialHandle('github', 'https://github.com/octocat/'), x: normalizeSocialHandle('x', 'https://twitter.com/jack'), linkedin: null })).toEqual([
      { label: 'GitHub', href: 'https://github.com/octocat' },
      { label: 'X', href: 'https://x.com/jack' },
    ]);
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
