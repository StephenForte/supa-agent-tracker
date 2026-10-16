import { useCallback, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { formatTimestamp } from '../../domain/format';
import { formatLastUsed, tokenStatus } from '../../domain/tokens/display';
import type { Project } from '../../domain/types';
import { useDemoAccount } from '../../app/useDemoAccount';
import { LiveTokensPanel } from './LiveTokensPanel';
import { TokenReveal } from './TokenReveal';

function scopeNames(projectIds: readonly string[], projects: readonly Project[]): string {
  return projectIds.map(id => projects.find(project => project.id === id)?.name ?? id).join(', ');
}

export function TokensPanel() {
  const demo = useDemoAccount();
  return demo ? <DemoTokensPanel /> : <LiveTokensPanel />;
}
function DemoTokensPanel() {
  const tracker = useTrackerData();
  const [attempt, setAttempt] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ kind: 'revoke' | 'rotate'; tokenId: string; label: string } | null>(null);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [revealGeneration, setRevealGeneration] = useState(0);
  const query = useSourceQuery(tracker, useCallback(async () => {
    void attempt;
    const [tokens, projects] = await Promise.all([tracker.listTokens(), tracker.listProjects()]);
    return { tokens, projects };
  }, [tracker, attempt]));

  function dismissReveal() { setPlaintext(null); }
  function showPlaintext(value: string) { setRevealGeneration(generation => generation + 1); setPlaintext(value); }
  function closeCreate() { setCreateOpen(false); setFormError(null); }

  async function createToken() {
    const result = await tracker.createToken({ label, projectIds });
    if (result.status === 'created') {
      setCreateOpen(false);
      setLabel('');
      setProjectIds([]);
      setFormError(null);
      showPlaintext(result.plaintext);
      return;
    }
    setFormError(result.status === 'invalid' ? result.message : 'The demo could not create a token.');
  }

  async function confirmPending() {
    if (!pending) return;
    const current = pending;
    setPending(null);
    if (current.kind === 'revoke') {
      const result = await tracker.revokeToken(current.tokenId);
      if (result.status !== 'saved') setActionError(result.status === 'invalid' ? result.message : 'The demo could not revoke that token.');
      return;
    }
    const result = await tracker.rotateToken(current.tokenId);
    if (result.status === 'created') {
      showPlaintext(result.plaintext);
      return;
    }
    setActionError(result.status === 'invalid' ? result.message : 'The demo could not rotate that token.');
  }

  if (query.status === 'loading') return <p>Loading tokens…</p>;
  if (query.status === 'error') return <ErrorState message={query.error.message} onRetry={() => setAttempt(value => value + 1)} />;
  const { tokens, projects } = query.data;
  return <div className="flex min-w-0 flex-col gap-4">
    <p className="lede">MCP tokens in this demo are fake. A new value is shown once, then discarded.</p>
    {actionError && <p role="alert">{actionError}</p>}
    {plaintext && <TokenReveal key={revealGeneration} plaintext={plaintext} onDismiss={dismissReveal} />}
    {tokens.length === 0 ? <EmptyState title="No MCP tokens"><p>Create a fake demo token to preview the one-time reveal.</p></EmptyState> : <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {tokens.map(token => <li key={token.id}><article aria-label={`${token.label} ${token.id}`} className="slot">
        <h2 className="break-words">{token.label}</h2>
        <p className="text-sm text-slate-600">{token.id}</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="text-sm text-slate-600">Scopes</dt><dd className="break-words">{scopeNames(token.projectIds, projects)}</dd></div>
          <div><dt className="text-sm text-slate-600">Masked value</dt><dd className="break-all font-mono text-sm">{token.display}</dd></div>
          <div><dt className="text-sm text-slate-600">Created</dt><dd>{formatTimestamp(token.createdAt)}</dd></div>
          <div><dt className="text-sm text-slate-600">Last used</dt><dd>{formatLastUsed(token.lastUsedAt)}</dd></div>
          <div><dt className="text-sm text-slate-600">Status</dt><dd>{tokenStatus(token)}</dd></div>
        </dl>
        {token.revokedAt === null && <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => { setActionError(null); setPending({ kind: 'rotate', tokenId: token.id, label: token.label }); }}>Rotate {token.label}</Button>
          <Button variant="danger" onClick={() => { setActionError(null); setPending({ kind: 'revoke', tokenId: token.id, label: token.label }); }}>Revoke {token.label}</Button>
        </div>}
      </article></li>)}
    </ul>}
    <div><Button variant="primary" onClick={() => { dismissReveal(); setFormError(null); setCreateOpen(true); }}>Create token</Button></div>
    {createOpen && <Dialog open title="Create a fake token" onClose={closeCreate}>
      <p>The value will be shown once after creation and cannot authenticate anything.</p>
      <div className="mt-3 flex max-w-md flex-col gap-1">
        <label htmlFor="token-label">Label</label>
        <input id="token-label" value={label} onChange={event => setLabel(event.target.value)} className="w-full rounded border border-slate-400 px-2 py-2" />
      </div>
      <fieldset className="mt-3 min-w-0">
        <legend>Project scope</legend>
        <div className="flex flex-col gap-2">
          {projects.map(project => <label key={project.id} className="flex items-start gap-2 break-words">
            <input type="checkbox" checked={projectIds.includes(project.id)} onChange={() => setProjectIds(current => current.includes(project.id) ? current.filter(id => id !== project.id) : [...current, project.id])} />
            <span>{project.name}</span>
          </label>)}
        </div>
      </fieldset>
      {formError && <p role="alert">{formError}</p>}
      <div className="mt-3"><Button variant="primary" onClick={() => void createToken()}>Create token</Button></div>
    </Dialog>}
    {pending && <Dialog open title={pending.kind === 'revoke' ? 'Revoke token?' : 'Rotate token?'} onClose={() => setPending(null)}>
      <p>{pending.kind === 'revoke' ? `Revoke ${pending.label}? It will show as revoked in this demo and still cannot authenticate anything.` : `Rotate ${pending.label}? The current token will be revoked and a new fake token will be shown once.`}</p>
      <Button variant={pending.kind === 'revoke' ? 'danger' : 'primary'} onClick={() => void confirmPending()}>{pending.kind === 'revoke' ? 'Revoke token' : 'Rotate token'}</Button>
    </Dialog>}
  </div>;
}
