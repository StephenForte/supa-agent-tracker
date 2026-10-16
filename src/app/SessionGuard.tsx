import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useTrackerData, useSourceQuery } from '../data/hooks';
import { ErrorState } from '../components/ui/ErrorState';
export function SessionGuard({ children }: { children: ReactNode }) {
  const source = useTrackerData();
  const location = useLocation();
  const [expired, setExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const session = useSourceQuery(source, useCallback(async () => {
    void attempt; return source.auth ? source.auth.getSession() : true;
  }, [source, attempt]));
  useEffect(() => { const expire = () => setExpired(true); window.addEventListener('session-expired', expire); return () => window.removeEventListener('session-expired', expire); }, []);
  if (!source.auth) return children;
  if (expired || (session.status === 'ready' && !session.data)) return <Navigate to="/login" replace state={{ returnTo: location.pathname + location.search }} />;
  if (session.status === 'loading') return <p>Loading session…</p>;
  if (session.status === 'error') return <ErrorState message={session.error.message} onRetry={() => setAttempt(value => value + 1)} />;
  return children;
}
