import { useState } from 'react';
import type { PublicProfilePayload } from '../../data/public/types';
import { formatDuration, formatStreak, formatJoined } from '../../domain/public/duration';
import { profileInitials, profileLinks } from '../../domain/public/profile';
import { ActivityHeatmap } from './ActivityHeatmap';
import { AgentsChart } from './AgentsChart';

export function ProfileSummary({ profile }: { profile: PublicProfilePayload }) {
  const [now] = useState(Date.now);
  const name = profile.owner.name?.trim() || profile.owner.handle;
  const links = profileLinks(profile.owner.links);
  const stats = [
    ['Longest agent', formatDuration(profile.stats.longestRunSeconds)],
    ['Agent runs', String(profile.stats.agentRuns)],
    ['Longest streak', formatStreak(profile.stats.longestStreakDays)],
    ['Current streak', formatStreak(profile.stats.currentStreakDays)],
  ] as const;
  return <>
    <header className="flex items-center gap-4">
      {profile.owner.avatarUrl
        ? <img src={profile.owner.avatarUrl} alt={`${name} avatar`} className="h-24 w-24 shrink-0 rounded-full object-cover" />
        : <div aria-hidden="true" className="public-avatar-fallback">{profileInitials(name)}</div>}
      <div className="min-w-0">
        <h1 className="mb-1">{name}</h1>
        <p className="mt-0 text-slate-600">@{profile.owner.handle}</p>
        {profile.owner.bio ? <p>{profile.owner.bio}</p> : null}
      </div>
    </header>
    <div className="mt-6 grid items-start gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <aside>
        <p>{formatJoined(profile.owner.joinedAt, now)}</p>
        {links.length > 0 && <ul className="grid gap-2">{links.map(link => <li key={link.label}><a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a></li>)}</ul>}
      </aside>
      <div className="min-w-0">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{stats.map(([label, value]) => <div key={label} className="rounded border border-slate-200 bg-white p-3">
          <dt className="text-sm text-slate-600">{label}</dt>
          <dd className="text-2xl font-semibold">{value}</dd>
        </div>)}</dl>
        <ActivityHeatmap activity={profile.activity} />
        <AgentsChart harnesses={profile.harnesses} />
      </div>
    </div>
  </>;
}
