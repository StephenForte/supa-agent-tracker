import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { useSourceQuery, useTrackerData } from '../data/hooks';
import { DemoAccountContext, useDemoAccount } from './useDemoAccount';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
export function Shell() {
  const source = useTrackerData();
  const account = useSourceQuery(source, useCallback(async () => typeof source.getAccount === 'function' ? source.getAccount() : { demo: true }, [source]));
  const demo = account.status === 'ready' ? account.data.demo : !source.auth;
  return <DemoAccountContext.Provider value={demo}><ShellFrame /></DemoAccountContext.Provider>;
}
function ShellFrame() {
  const source = useTrackerData();
  const demo = useDemoAccount();
  useEffect(() => { document.title = demo ? 'Supa Agent Tracker · Demo' : 'Supa Agent Tracker'; }, [demo]);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    {demo && <div className="demo-banner"><span><strong>Demo — simulated data</strong><span className="demo-detail"> · Local browser state only</span></span><Button onClick={() => setResetOpen(true)}>Reset demo</Button></div>}
    <header className="app-header"><Link className="brand" to="/projects"><span className="brand-mark" aria-hidden="true">S</span>Supa Agent Tracker</Link>
      <nav aria-label="Main navigation"><NavLink to="/projects">Projects</NavLink><NavLink to="/agents">All agents</NavLink><NavLink to="/settings">Account & settings</NavLink></nav>
    </header>
    <main id="main" tabIndex={-1}><Outlet /></main>
    <footer>{demo ? 'Phase 0 · UX shell' : 'Supa Agent Tracker'} <span>{demo && 'Demo operator · '} <Link to="/logout">Log out</Link></span></footer>
    <p className="sr-only" role="status">{resetMessage}</p>
    <Dialog open={demo && resetOpen} title="Reset demo?" onClose={() => setResetOpen(false)}><p>This restores the seeded projects, runs, steps, private notes and fake tokens. Your demo edits will be removed.</p><Button variant="danger" onClick={() => { void source.resetDemo().then(() => { setResetOpen(false); setResetMessage('Demo reset. Seed data restored.'); }, () => setResetMessage('Reset failed. Try again.')); }}>Restore seed data</Button></Dialog>
  </div>;
}
