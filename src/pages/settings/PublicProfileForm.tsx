import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { useTrackerData } from '../../data/hooks';
import { AVATAR_NEEDS_LIVE, uploadAvatarFile } from '../../data/public/avatar';
import type { Account } from '../../domain/types';
import { emptyPublicProfile, initialTimezone, profileErrors, profileInputFromFields, timezoneOptions } from '../../domain/public/profile';

export function PublicProfileForm({ account }: { account: Account }) {
  const tracker = useTrackerData();
  const saved = account.publicProfile ?? emptyPublicProfile();
  const [name, setName] = useState(saved.name ?? '');
  const [bio, setBio] = useState(saved.bio ?? '');
  const [github, setGithub] = useState(saved.github ?? '');
  const [x, setX] = useState(saved.x ?? '');
  const [linkedin, setLinkedin] = useState(saved.linkedin ?? '');
  const [timezone, setTimezone] = useState(() => initialTimezone(saved));
  const [errors, setErrors] = useState<Partial<Record<'name' | 'bio' | 'github' | 'x' | 'linkedin' | 'timezone', string>>>({});
  const [message, setMessage] = useState('');
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
    const input = profileInputFromFields({ name, bio, github, x, linkedin, timezone });
    const nextErrors = profileErrors(input);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) { release(); return; }
    try {
      const result = await tracker.updateAccount({ publicProfile: input });
      setMessage(result.status === 'saved' ? 'Public profile saved.' : result.message);
    } catch {
      setMessage('The public profile could not be saved. Try again.');
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
        <input id="profile-name" className="mt-1 w-full rounded border border-slate-400 bg-white p-2" value={name} aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? 'profile-name-error' : undefined} onChange={event => setName(event.target.value)} autoComplete="name" />
      </label>
      {errors.name && <p id="profile-name-error" role="alert">{errors.name}</p>}
      <label className="text-sm font-medium" htmlFor="profile-bio">Bio
        <textarea id="profile-bio" className="mt-1 w-full rounded border border-slate-400 bg-white p-2" rows={3} value={bio} aria-invalid={errors.bio ? true : undefined} aria-describedby="profile-bio-count" onChange={event => setBio(event.target.value)} />
      </label>
      <p id="profile-bio-count" className="text-sm text-slate-600">{bio.trim().length}/160</p>
      {errors.bio && <p role="alert">{errors.bio}</p>}
      <label className="text-sm font-medium" htmlFor="profile-github">GitHub
        <input id="profile-github" className="mt-1 w-full rounded border border-slate-400 bg-white p-2" value={github} aria-invalid={errors.github ? true : undefined} onChange={event => setGithub(event.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      {errors.github && <p role="alert">{errors.github}</p>}
      <label className="text-sm font-medium" htmlFor="profile-x">X
        <input id="profile-x" className="mt-1 w-full rounded border border-slate-400 bg-white p-2" value={x} aria-invalid={errors.x ? true : undefined} onChange={event => setX(event.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      {errors.x && <p role="alert">{errors.x}</p>}
      <label className="text-sm font-medium" htmlFor="profile-linkedin">LinkedIn
        <input id="profile-linkedin" className="mt-1 w-full rounded border border-slate-400 bg-white p-2" value={linkedin} aria-invalid={errors.linkedin ? true : undefined} onChange={event => setLinkedin(event.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      {errors.linkedin && <p role="alert">{errors.linkedin}</p>}
      <label className="text-sm font-medium" htmlFor="profile-timezone">Timezone
        <select id="profile-timezone" className="mt-1 w-full rounded border border-slate-400 bg-white p-2" value={timezone} aria-invalid={errors.timezone ? true : undefined} onChange={event => setTimezone(event.target.value)}>
          {!zones.includes(timezone) && <option value={timezone}>{timezone}</option>}
          {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
        </select>
      </label>
      {errors.timezone && <p role="alert">{errors.timezone}</p>}
      <Button type="button" variant="primary" disabled={pending} onClick={() => void save()}>Save profile</Button>
    </div>
    {account.publicHandle && <p className="text-sm"><Link to={`/public/${account.publicHandle}`}>View public profile</Link></p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
