import { lazy, Suspense, useCallback } from 'react';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { useDemoAccount } from '../../app/useDemoAccount';
import { NavLink, useLocation } from 'react-router';
import { IntegrationsPanel } from '../../features/integrations/IntegrationsPanel';
import { TokensPanel } from '../../features/tokens/TokensPanel';
import { AccountSettings } from './AccountSettings';

// Compile-time gate keeps all invite HTTP code out of the public demo bundle.
const InvitesPanel = import.meta.env.VITE_DATA_SOURCE === 'http' || import.meta.env.MODE === 'test'
  ? lazy(() => import('../../features/invites/InvitesPanel').then(module => ({ default: module.InvitesPanel })))
  : () => null;

export function SettingsPage({ title }: { title: string }) {
  const { pathname } = useLocation();
  const demo = useDemoAccount();
  const tracker = useTrackerData();
  const account = useSourceQuery(tracker, useCallback(async () => demo ? null : tracker.getAccount(), [demo, tracker]));
  const admin = !demo && account.status === 'ready' && account.data?.isAdmin === true;
  return <>
    <p className="eyebrow">{demo ? 'Simulated account' : 'Account'}</p>
    <h1>{title}</h1>
    <nav aria-label="Settings sections" className="link-list">
      <NavLink to="/settings" end>Account settings</NavLink>
      <NavLink to="/settings/tokens">MCP tokens</NavLink>
      {admin && <NavLink to="/settings/invites">Invites</NavLink>}
      <NavLink to="/settings/integrations">Integration setup</NavLink>
    </nav>
    {pathname === '/settings/invites' && (admin ? <Suspense fallback={<p>Loading invites…</p>}><InvitesPanel /></Suspense> : <p>Invites are available to the verified administrator.</p>)}
    {pathname === '/settings' && <AccountSettings />}
    {pathname === '/settings/tokens' && <TokensPanel />}
    {pathname === '/settings/integrations' && <IntegrationsPanel />}
  </>;
}
