import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { useTrackerData } from '../../data/hooks';
import { AVATAR_NEEDS_LIVE, uploadAvatarFile } from '../../data/public/avatar';
import type { Account } from '../../domain/types';
import { emptyPublicProfile, initialTimezone, profileErrors, profileInputFromFields, timezoneOptions } from '../../domain/public/profile';

const hints = {
  name: 'Up to 60 characters.',
  bio: 'Up to 160 characters.',
  github: 'Your GitHub username, e.g. octocat. Not the full URL.',
  x: 'Your X handle without the @, e.g. jack.',
  linkedin: 'The part after linkedin.com/in/, e.g. jane-doe.',
} as const;

const fieldOrder = ['name', 'bio', 'github', 'x', 'linkedin', 'timezone'] as const;
type ProfileField = typeof fieldOrder[number];
type ProfileErrors = Partial<Record<ProfileField, string>>;

const fieldLabels: Record<ProfileField, string> = {
  name: 'Profile name',
  bio: 'Bio',
  github: 'GitHub',
  x: 'X',
  linkedin: 'LinkedIn',
  timezone: 'Timezone',
};

function failureSummary(errors: ProfileErrors): string {
  const names = fieldOrder.filter(field => errors[field]).map(field => fieldLabels[field]);
  if (names.length === 1) return `Not saved: fix ${names[0]}.`;
  if (names.length === 2) return `Not saved: fix ${names[0]} and ${names[1]}.`;
  return `Not saved: fix ${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}.`;
}

function describedBy(hintId: string | undefined, errorId: string, invalid: boolean): string | undefined {
  const ids = [hintId, invalid ? errorId : undefined].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

const control = 'mt-1 w-full rounded border border-slate-400 bg-white p-2';

export function PublicProfileForm({ account }: { account: Account }) {
  const tracker = useTrackerData();
  const saved = account.publicProfile ?? emptyPublicProfile();
  const [name, setName] = useState(saved.name ?? '');
  const [bio, setBio] = useState(saved.bio ?? '');
  const [github, setGithub] = useState(saved.github ?? '');
  const [x, setX] = useState(saved.x ?? '');
  const [linkedin, setLinkedin] = useState(saved.linkedin ?? '');
  const [timezone, setTimezone] = useState(() => initialTimezone(saved));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const preview = useRef<string | null>(null);
  const busy = useRef(false);
  useEffect(() => () => { if (preview.current) URL.revokeObjectURL(preview.current); }, []);
  function replacePreview(next: string | null) {
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = next;
    setPreviewUrl(next);
  }
  function occupy(): boolean {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    setMessage('');
    return true;
  }
  function release() {
    busy.current = false;
    setPending(false);
  }
  async function save() {
    if (!occupy()) return;
    setNotice(null);
    const input = profileInputFromFields({ name, bio, github, x, linkedin, timezone });
    setGithub(input.github ?? '');
    setX(input.x ?? '');
    setLinkedin(input.linkedin ?? '');
    const nextErrors = profileErrors(input);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setNotice({ tone: 'error', text: failureSummary(nextErrors) });
      const first = fieldOrder.find(field => nextErrors[field]);
      if (first) document.getElementById(`profile-${first}`)?.focus();
      release();
      return;
    }
    try {
      const result = await tracker.updateAccount({ publicProfile: input });
      if (result.status === 'saved') setNotice({ tone: 'ok', text: 'Public profile saved.' });
      else setNotice({ tone: 'error', text: result.message });
    } catch {
      setNotice({ tone: 'error', text: 'The public profile could not be saved. Try again.' });
    } finally {
      release();
    }
  }
  async function onPick(file: File | undefined) {
    if (!file || !occupy()) return;
    try {
      await uploadAvatarFile(file, async blob => {
        const result = await tracker.uploadAvatar(blob);
        if (result.status !== 'saved') { setMessage(result.message); return; }
        replacePreview(URL.createObjectURL(blob));
        setMessage('Avatar saved.');
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not prepare the image.');
    } finally {
      release();
    }
  }
  async function removeAvatar() {
    if (!occupy()) return;
    try {
      const result = await tracker.removeAvatar();
      if (result.status === 'saved') replacePreview(null);
      setMessage(result.status === 'saved' ? 'Avatar removed.' : result.message);
    } catch {
      setMessage('The avatar could not be removed. Try again.');
    } finally {
      release();
    }
  }
  const zones = timezoneOptions();
  return <section className="slot" aria-labelledby="public-profile-heading">
    <h2 id="public-profile-heading">Public profile</h2>
    <p className="text-sm text-slate-600">This name, bio, and links appear on your public page. Empty text fields are cleared.</p>
    {account.demo ? <p>{AVATAR_NEEDS_LIVE}</p> : <div className="grid max-w-xl gap-3">
      <label className="text-sm font-medium" htmlFor="profile-avatar">Avatar
        <input id="profile-avatar" className="mt-1 block w-full" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ''; void onPick(file); }} />
      </label>
      {previewUrl && <img src={previewUrl} alt="Avatar preview" className="h-16 w-16 rounded-full object-cover" />}
      {saved.avatarUpdatedAt && !previewUrl ? <p className="text-sm">An avatar is saved.</p> : null}
      <Button type="button" disabled={pending} onClick={() => void removeAvatar()}>Remove</Button>
    </div>}
    {/* The public-handle control is the only form on this page, so password fields stay outside a form. */}
    <div className="mt-4 grid max-w-xl gap-3">
      <label className="text-sm font-medium" htmlFor="profile-name">Profile name
        <input id="profile-name" className={`${control}${errors.name ? ' profile-invalid' : ''}`} value={name} placeholder={hints.name} aria-invalid={errors.name ? true : undefined} aria-describedby={describedBy('profile-name-hint', 'profile-name-error', !!errors.name)} onChange={event => setName(event.target.value)} autoComplete="name" />
      </label>
      <p id="profile-name-hint" className="text-sm text-slate-600">{hints.name}</p>
      {errors.name && <p id="profile-name-error" className="profile-field-error" role="alert">{errors.name}</p>}
      <label className="text-sm font-medium" htmlFor="profile-bio">Bio
        <textarea id="profile-bio" className={`${control}${errors.bio ? ' profile-invalid' : ''}`} rows={3} value={bio} placeholder={hints.bio} aria-invalid={errors.bio ? true : undefined} aria-describedby={describedBy('profile-bio-hint profile-bio-count', 'profile-bio-error', !!errors.bio)} onChange={event => setBio(event.target.value)} />
      </label>
      <p id="profile-bio-hint" className="text-sm text-slate-600">{hints.bio}</p>
      <p id="profile-bio-count" className="text-sm text-slate-600">{bio.trim().length}/160</p>
      {errors.bio && <p id="profile-bio-error" className="profile-field-error" role="alert">{errors.bio}</p>}
      <label className="text-sm font-medium" htmlFor="profile-github">GitHub
        <input id="profile-github" className={`${control}${errors.github ? ' profile-invalid' : ''}`} value={github} placeholder={hints.github} aria-invalid={errors.github ? true : undefined} aria-describedby={describedBy('profile-github-hint', 'profile-github-error', !!errors.github)} onChange={event => setGithub(event.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <p id="profile-github-hint" className="text-sm text-slate-600">{hints.github}</p>
      {errors.github && <p id="profile-github-error" className="profile-field-error" role="alert">{errors.github}</p>}
      <label className="text-sm font-medium" htmlFor="profile-x">X
        <input id="profile-x" className={`${control}${errors.x ? ' profile-invalid' : ''}`} value={x} placeholder={hints.x} aria-invalid={errors.x ? true : undefined} aria-describedby={describedBy('profile-x-hint', 'profile-x-error', !!errors.x)} onChange={event => setX(event.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <p id="profile-x-hint" className="text-sm text-slate-600">{hints.x}</p>
      {errors.x && <p id="profile-x-error" className="profile-field-error" role="alert">{errors.x}</p>}
      <label className="text-sm font-medium" htmlFor="profile-linkedin">LinkedIn
        <input id="profile-linkedin" className={`${control}${errors.linkedin ? ' profile-invalid' : ''}`} value={linkedin} placeholder={hints.linkedin} aria-invalid={errors.linkedin ? true : undefined} aria-describedby={describedBy('profile-linkedin-hint', 'profile-linkedin-error', !!errors.linkedin)} onChange={event => setLinkedin(event.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <p id="profile-linkedin-hint" className="text-sm text-slate-600">{hints.linkedin}</p>
      {errors.linkedin && <p id="profile-linkedin-error" className="profile-field-error" role="alert">{errors.linkedin}</p>}
      <label className="text-sm font-medium" htmlFor="profile-timezone">Timezone
        <select id="profile-timezone" className={`${control}${errors.timezone ? ' profile-invalid' : ''}`} value={timezone} aria-invalid={errors.timezone ? true : undefined} aria-describedby={describedBy(undefined, 'profile-timezone-error', !!errors.timezone)} onChange={event => setTimezone(event.target.value)}>
          {!zones.includes(timezone) && <option value={timezone}>{timezone}</option>}
          {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
        </select>
      </label>
      {errors.timezone && <p id="profile-timezone-error" className="profile-field-error" role="alert">{errors.timezone}</p>}
      <div className="profile-save-row">
        <Button type="button" variant="primary" disabled={pending} onClick={() => void save()}>Save profile</Button>
        {notice?.tone === 'error' ? <p className="profile-save-error" role="alert">{notice.text}</p> : null}
        {notice?.tone === 'ok' ? <p role="status">{notice.text}</p> : null}
      </div>
    </div>
    {account.publicHandle && <p className="text-sm"><Link to={`/public/${account.publicHandle}`}>View public profile</Link></p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
