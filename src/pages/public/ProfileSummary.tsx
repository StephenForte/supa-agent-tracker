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
    <header className="public-profile-header">
      {profile.owner.avatarUrl
        ? <img src={profile.owner.avatarUrl} alt={`${name} avatar`} className="public-avatar" />
        : <div aria-hidden="true" className="public-avatar-fallback">{profileInitials(name)}</div>}
      <div className="min-w-0">
        <h1 className="mb-1">{name}</h1>
        <p className="mt-0 text-slate-600">@{profile.owner.handle}</p>
        {profile.owner.bio ? <p>{profile.owner.bio}</p> : null}
        <div className="public-profile-meta">
          <span>{formatJoined(profile.owner.joinedAt, now)}</span>
          {links.map(link => <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>)}
        </div>
      </div>
    </header>
    <dl className="public-profile-stats">{stats.map(([label, value]) => <div key={label}>
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="text-2xl font-semibold">{value}</dd>
    </div>)}</dl>
    <div className="public-profile-charts">
      <ActivityHeatmap activity={profile.activity} />
      <AgentsChart harnesses={profile.harnesses} />
    </div>
  </>;
}
