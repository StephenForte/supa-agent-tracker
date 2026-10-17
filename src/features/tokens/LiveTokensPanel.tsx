import { useCallback, useEffect, useRef, useState } from 'react';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { ErrorState } from '../../components/ui/ErrorState';
import { formatTimestamp } from '../../domain/format';
import { deploymentMcpUrl } from '../../domain/integrations/examples';
import { formatLastUsed, tokenScopeLabel, tokenStatus } from '../../domain/tokens/display';
import type { McpToken, Project } from '../../domain/types';
import { ScopeFields, type ScopeMode } from './ScopeFields';
import { TokenReveal } from './TokenReveal';
type Action = { kind: 'create' } | { kind: 'rotate' | 'revoke'; id: string; label: string } | { kind: 'scope'; token: McpToken };
export function LiveTokensPanel() {
  const tracker = useTrackerData(); const [action, setAction] = useState<Action | null>(null); const [attempt, setAttempt] = useState(0);
  const query = useSourceQuery(tracker, useCallback(async () => {
    void attempt; const [tokens, projects] = await Promise.all([tracker.listTokens(), tracker.listProjects()]); return { tokens, projects };
  }, [tracker, attempt]));
  if (query.status === 'loading') return <p>Loading tokens…</p>;
  if (query.status === 'error') return <ErrorState message={query.error.message} onRetry={() => setAttempt(n => n + 1)} />;
  const { tokens, projects } = query.data;
  return <div className="grid gap-4"><p>MCP tokens can cover all of your projects, including ones you create later, or a specific list. A new value is shown once.</p>
    {!tokens.length && <p>No MCP tokens. Create a token to connect an agent.</p>}
    {tokens.map(token => <article className="slot" key={token.id} aria-label={`${token.label} ${token.id}`}><h2>{token.label}</h2>
      <dl><dt>Masked value</dt><dd>{token.display}</dd><dt>Scopes</dt><dd>{tokenScopeLabel(token, projects)}</dd>
      <dt>Created</dt><dd>{formatTimestamp(token.createdAt)}</dd><dt>Last used</dt><dd>{formatLastUsed(token.lastUsedAt)}</dd><dt>Status</dt><dd>{tokenStatus(token)}</dd></dl>
      {!token.revokedAt && <div className="link-list"><Button onClick={() => setAction({ kind: 'scope', token })}>Edit scope</Button><Button onClick={() => setAction({ kind: 'rotate', id: token.id, label: token.label })}>Rotate {token.label}</Button><Button onClick={() => setAction({ kind: 'revoke', id: token.id, label: token.label })}>Revoke {token.label}</Button></div>}
    </article>)}
    <div><Button onClick={() => setAction({ kind: 'create' })}>Create token</Button></div>
    {action && <TokenActionDialog key={action.kind === 'scope' ? `scope-${action.token.id}` : JSON.stringify(action)} action={action} projects={projects} onClose={() => setAction(null)} />}
  </div>;
}
/** The plaintext and client config snippets are owned by this mounted dialog only, never by a query or its parent. */
function TokenActionDialog({ action, projects, onClose }: { action: Action; projects: Project[]; onClose: () => void }) {
  const tracker = useTrackerData(); const [plaintext, setPlaintext] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<ScopeMode>(action.kind === 'scope' ? (action.token.allProjects ? 'all' : 'specific') : 'all');
  const [projectIds, setProjectIds] = useState<string[]>(action.kind === 'scope' && !action.token.allProjects ? [...action.token.projectIds] : []);
  const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function confirm() {
    if (pending) return; setPending(true); setError('');
    const scope = { allProjects: mode === 'all', projectIds: mode === 'all' ? [] : projectIds };
    try {
      const result = action.kind === 'create' ? await tracker.createToken({ label, ...scope })
        : action.kind === 'scope' ? await tracker.updateTokenScope(action.token.id, scope)
        : action.kind === 'rotate' ? await tracker.rotateToken(action.id) : await tracker.revokeToken(action.id);
      if (!mounted.current) return;
      if (result.status === 'created') setPlaintext(result.plaintext);
      else if (result.status === 'saved') onClose();
      else setError(result.status === 'invalid' ? result.message : 'This token changed or is no longer available. Refresh and try again.');
    } catch { if (mounted.current) setError('Unable to update this token. Please try again.'); }
    finally { if (mounted.current) setPending(false); }
  }
  const title = plaintext ? 'Copy your token' : action.kind === 'create' ? 'Create token' : action.kind === 'scope' ? 'Edit scope' : action.kind === 'rotate' ? 'Rotate token?' : 'Revoke token?';
  return <Dialog open title={title} onClose={onClose}>
    {plaintext ? <TokenReveal demo={false} plaintext={plaintext} mcpUrl={deploymentMcpUrl(window.location.origin)} onDismiss={onClose} /> : <>
      {action.kind === 'create' || action.kind === 'scope' ? <>
        {action.kind === 'create' && <label>Label<input value={label} onChange={e => setLabel(e.target.value)} /></label>}
        <ScopeFields mode={mode} projectIds={projectIds} projects={projects} onMode={setMode} onProjectIds={setProjectIds} />
      </> : <p>{action.kind === 'rotate' ? `Rotate ${action.label}? The current token will be revoked and a replacement shown once.` : `Revoke ${action.label}? Agents using it will lose access.`}</p>}
      {error && <p role="alert">{error}</p>}<Button disabled={pending} onClick={() => void confirm()}>{pending ? 'Please wait…' : action.kind === 'create' ? 'Create token' : action.kind === 'scope' ? 'Save scope' : action.kind === 'rotate' ? 'Rotate token' : 'Revoke token'}</Button>
    </>}
  </Dialog>;
}
