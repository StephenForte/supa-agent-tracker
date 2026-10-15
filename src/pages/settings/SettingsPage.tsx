import { Link } from 'react-router';
import { Placeholder } from '../../app/Placeholder';
export function SettingsPage({ title }: { title: string }) { return <Placeholder title={title} owner="T0-06"><div className="link-list"><Link to="/settings">Account settings</Link><Link to="/settings/tokens">MCP tokens</Link><Link to="/settings/integrations">Integration setup</Link></div><p>Demo identity: demo@example.invalid</p>{title === 'Integration setup' && <p>Cursor, Claude Desktop/macOS, Grok Bot: Not connected · Not tested.</p>}</Placeholder>; }
