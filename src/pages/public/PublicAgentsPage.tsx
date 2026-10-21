import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { publicAgentsLoader, publicProfileLoader } from '../../data/public/load';
import type { PublicAgentsLoader, PublicAgentsPayload, PublicProfileLoader, PublicProfilePayload } from '../../data/public/types';
import { publicAgentsView } from '../../domain/public/agents';
import { ProfileSummary } from './ProfileSummary';
import { PublicAgentSection } from './PublicAgentSection';

const POLL_MS = 30_000;

function usePublicDocument(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.append(meta);
    return () => { meta.remove(); document.title = previous; };
  }, [title]);
}

type AsyncState<T> = { kind: 'idle' } | { kind: 'loading' } | { kind: 'missing' } | { kind: 'error' } | { kind: 'ready'; data: T };

export function PublicAgentsPage({ loader = publicAgentsLoader, profileLoader = publicProfileLoader }: { loader?: PublicAgentsLoader | null; profileLoader?: PublicProfileLoader | null }) {
  const handle = useParams().handle ?? '';
  const [params, setParams] = useSearchParams();
  const view = publicAgentsView(params.get('view'));
  const [agents, setAgents] = useState<AsyncState<PublicAgentsPayload>>(loader ? { kind: 'loading' } : { kind: 'idle' });
  const [profile, setProfile] = useState<AsyncState<PublicProfilePayload>>(profileLoader ? { kind: 'loading' } : { kind: 'idle' });
  const displayName = profile.kind === 'ready' ? (profile.data.owner.name?.trim() || profile.data.owner.handle) : (handle || 'Public profile');
  usePublicDocument(handle ? `${displayName} (@${handle})` : displayName);
  useEffect(() => {
    if (!loader && !profileLoader) return;
    let stopped = false;
    let timer = 0;
    const loadAgents = loader;
    const loadProfile = profileLoader;
    async function refreshAgents() {
      if (!loadAgents || stopped || document.visibilityState === 'hidden') return;
      try {
        const result = await loadAgents(handle);
        if (!stopped) setAgents(result === 'missing' ? { kind: 'missing' } : { kind: 'ready', data: result });
      } catch {
        if (!stopped) setAgents({ kind: 'error' });
      }
    }
    async function refreshProfile() {
      if (!loadProfile || stopped || document.visibilityState === 'hidden') return;
      try {
        const result = await loadProfile(handle);
        if (!stopped) setProfile(result === 'missing' ? { kind: 'missing' } : { kind: 'ready', data: result });
      } catch {
        if (!stopped) setProfile({ kind: 'error' });
      }
    }
    function schedule() {
      timer = window.setTimeout(() => { void refreshAgents().finally(() => { if (!stopped) schedule(); }); }, POLL_MS);
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshAgents();
      void refreshProfile();
    };
    document.addEventListener('visibilitychange', onVisibility);
    void refreshAgents().finally(() => { if (!stopped && loadAgents) schedule(); });
    void refreshProfile();
    return () => { stopped = true; window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [handle, loader, profileLoader]);
  function setView(next: 'grid' | 'table') {
    const updated = new URLSearchParams(params);
    if (next === 'table') updated.set('view', 'table');
    else updated.delete('view');
    setParams(updated, { replace: true });
  }
  const blocked = agents.kind === 'missing' || profile.kind === 'missing';
  const failed = !blocked && (agents.kind === 'error' || profile.kind === 'error');
  const waitingForProfile = Boolean(profileLoader) && profile.kind === 'loading';
  const waitingForAgents = Boolean(loader) && agents.kind === 'loading';
  return <main className="public-page mx-auto min-w-0 max-w-6xl px-4 py-8">
    <p className="eyebrow">Public profile</p>
    {!loader && !profileLoader ? <>
      <h1>{handle || 'Public profile'}</h1>
      <p>Public pages need the live app.</p>
    </> : blocked ? <>
      <h1>{displayName}</h1>
      <p>No public page here.</p>
    </> : failed ? <>
      <h1>{displayName}</h1>
      <p role="alert">The public page could not be loaded.</p>
    </> : <>
      {waitingForProfile ? <><h1>{displayName}</h1><p>Loading public page…</p></> : profile.kind === 'ready' ? <ProfileSummary profile={profile.data} /> : <h1>{displayName}</h1>}
      {waitingForProfile ? null : waitingForAgents ? <p>Loading public page…</p> : agents.kind === 'ready' ? <PublicAgentSection page={agents.data} view={view} onView={setView} /> : null}
    </>}
  </main>;
}
