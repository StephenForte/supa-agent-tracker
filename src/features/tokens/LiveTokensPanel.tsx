import { useCallback, useEffect, useRef, useState } from 'react';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { ErrorState } from '../../components/ui/ErrorState';
import { formatTimestamp } from '../../domain/format';
import { formatLastUsed, tokenStatus } from '../../domain/tokens/display';
import type { Project } from '../../domain/types';
import { TokenReveal } from './TokenReveal';
type Action = { kind: 'create' } | { kind: 'rotate' | 'revoke'; id: string; label: string };
export function LiveTokensPanel() {
  const tracker = useTrackerData(); const [action, setAction] = useState<Action | null>(null); const [attempt, setAttempt] = useState(0);
  const query = useSourceQuery(tracker, useCallback(async () => {
    void attempt; const [tokens, projects] = await Promise.all([tracker.listTokens(), tracker.listProjects()]); return { tokens, projects };
  }, [tracker, attempt]));
  if (query.status === 'loading') return <p>Loading tokens…</p>;
  if (query.status === 'error') return <ErrorState message={query.error.message} onRetry={() => setAttempt(n => n + 1)} />;
  const { tokens, projects } = query.data;
  return <div className="grid gap-4"><p>MCP tokens authorize agents for the projects you select. A new value is shown once.</p>
    {!tokens.length && <p>No MCP tokens. Create a token to connect an agent.</p>}
    {tokens.map(token => <article className="slot" key={token.id} aria-label={`${token.label} ${token.id}`}><h2>{token.label}</h2>
      <dl><dt>Masked value</dt><dd>{token.display}</dd><dt>Scopes</dt><dd>{token.projectIds.map(id => projects.find(p => p.id === id)?.name ?? id).join(', ')}</dd>
      <dt>Created</dt><dd>{formatTimestamp(token.createdAt)}</dd><dt>Last used</dt><dd>{formatLastUsed(token.lastUsedAt)}</dd><dt>Status</dt><dd>{tokenStatus(token)}</dd></dl>
      {!token.revokedAt && <div className="link-list"><Button onClick={() => setAction({ kind: 'rotate', id: token.id, label: token.label })}>Rotate {token.label}</Button><Button onClick={() => setAction({ kind: 'revoke', id: token.id, label: token.label })}>Revoke {token.label}</Button></div>}
    </article>)}
    <div><Button onClick={() => setAction({ kind: 'create' })}>Create token</Button></div>
    {action && <TokenActionDialog key={JSON.stringify(action)} action={action} projects={projects} onClose={() => setAction(null)} />}
  </div>;
}
/** The plaintext is owned by this mounted dialog only, never by a query or its parent. */
function TokenActionDialog({ action, projects, onClose }: { action: Action; projects: Project[]; onClose: () => void }) {
  const tracker = useTrackerData(); const [plaintext, setPlaintext] = useState<string | null>(null);
  const [label, setLabel] = useState(''); const [projectIds, setProjectIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function confirm() {
    if (pending) return; setPending(true); setError('');
    try {
      const result = action.kind === 'create' ? await tracker.createToken({ label, projectIds }) : action.kind === 'rotate' ? await tracker.rotateToken(action.id) : await tracker.revokeToken(action.id);
      if (!mounted.current) return;
      if (result.status === 'created') setPlaintext(result.plaintext);
      else if (result.status === 'saved') onClose();
      else setError(result.status === 'invalid' ? result.message : 'This token changed or is no longer available. Refresh and try again.');
    } catch { if (mounted.current) setError('Unable to update this token. Please try again.'); }
    finally { if (mounted.current) setPending(false); }
  }
  return <Dialog open title={plaintext ? 'Copy your token' : action.kind === 'create' ? 'Create token' : action.kind === 'rotate' ? 'Rotate token?' : 'Revoke token?'} onClose={onClose}>
    {plaintext ? <TokenReveal demo={false} plaintext={plaintext} onDismiss={onClose} /> : <>
      {action.kind === 'create' ? <><label>Label<input value={label} onChange={e => setLabel(e.target.value)} /></label><fieldset><legend>Project scope</legend>{projects.map(project => <label key={project.id}><input type="checkbox" checked={projectIds.includes(project.id)} onChange={() => setProjectIds(ids => ids.includes(project.id) ? ids.filter(id => id !== project.id) : [...ids, project.id])} />{project.name}</label>)}</fieldset></> : <p>{action.kind === 'rotate' ? `Rotate ${action.label}? The current token will be revoked and a replacement shown once.` : `Revoke ${action.label}? Agents using it will lose access.`}</p>}
      {error && <p role="alert">{error}</p>}<Button disabled={pending} onClick={() => void confirm()}>{pending ? 'Please wait…' : action.kind === 'create' ? 'Create token' : action.kind === 'rotate' ? 'Rotate token' : 'Revoke token'}</Button>
    </>}
  </Dialog>;
}
