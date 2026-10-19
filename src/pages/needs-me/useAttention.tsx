import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { useNow } from '../../domain/clock';
import { needsAttention } from '../../domain/needs-me/attention';

function useAttentionQuery() {
  const source = useTrackerData();
  const now = useNow();
  const [attempt, setAttempt] = useState(0);
  const result = useSourceQuery(source, useCallback(async () => {
    void attempt;
    const account = source.auth ? await source.auth.getSession() : await source.getAccount();
    if (!account) return null;
    const [projects, runs, agents] = await Promise.all([source.listProjects(), source.listRuns(), source.listAgents()]);
    return { account, projects, runs, agents };
  }, [source, attempt]));
  return { result, attention: result.status === 'ready' && result.data ? needsAttention(result.data.account.id, result.data.projects, result.data.runs, result.data.agents, now) : null, now, retry: () => setAttempt(value => value + 1) };
}
const AttentionContext = createContext<ReturnType<typeof useAttentionQuery> | null>(null);
/** Shares one observed query; refreshes through the data source's existing poller. */
export function AttentionProvider({ children }: { children: ReactNode }) {
  const value = useAttentionQuery();
  return <AttentionContext.Provider value={value}>{children}</AttentionContext.Provider>;
}
export function useAttention() {
  const value = useContext(AttentionContext);
  if (!value) throw new Error('AttentionProvider is required');
  return value;
}
