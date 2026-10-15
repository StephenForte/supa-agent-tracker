import { NavLink, useLocation } from 'react-router';
import { IntegrationsPanel } from '../../features/integrations/IntegrationsPanel';
import { TokensPanel } from '../../features/tokens/TokensPanel';
import { AccountSettings } from './AccountSettings';

export function SettingsPage({ title }: { title: string }) {
  const { pathname } = useLocation();
  return <>
    <p className="eyebrow">Simulated account</p>
    <h1>{title}</h1>
    <nav aria-label="Settings sections" className="link-list">
      <NavLink to="/settings" end>Account settings</NavLink>
      <NavLink to="/settings/tokens">MCP tokens</NavLink>
      <NavLink to="/settings/integrations">Integration setup</NavLink>
    </nav>
    {pathname === '/settings' && <AccountSettings />}
    {pathname === '/settings/tokens' && <TokensPanel />}
    {pathname === '/settings/integrations' && <IntegrationsPanel />}
  </>;
}
