import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useTrackerData } from '../../data/hooks';
import { Button } from '../../components/ui/Button';
export function LiveAuthScreen() {
  const { auth } = useTrackerData();
  const location = useLocation(); const navigate = useNavigate();
  const path = location.pathname;
  const token = new URLSearchParams(location.search).get('token');
  const [invite] = useState(() => path === '/register' ? new URLSearchParams(location.search).get('invite') : null);
  useEffect(() => {
    if (path !== '/register') return;
    const query = new URLSearchParams(location.search);
    if (!query.has('invite')) return;
    query.delete('invite');
    navigate({ pathname: path, search: query.toString(), hash: location.hash }, { replace: true, state: location.state });
  }, [path, location.search, location.hash, location.state, navigate]);
  const [message, setMessage] = useState(''); const [pending, setPending] = useState(false);
  const verification = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (path !== '/verify-email' || !auth || !token) return;
    let active = true;
    verification.current ??= auth.verify(token);
    void verification.current.then(() => { if (active) { setMessage('Email verified. You can log in.'); navigate('/verify-email', { replace: true }); } }, () => { if (active) setMessage('Email verification failed. Open a valid link from your email.'); });
    return () => { active = false; };
  }, [auth, path, token, navigate]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!auth || pending) return;
    const form = event.currentTarget; const data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? '');
    if ((path === '/register' || path === '/reset-password') && value('password') !== value('confirm')) { setMessage('Passwords do not match.'); return; }
    setPending(true); setMessage('');
    try {
      if (path === '/register') { await auth.submit('sign-up/email', { name: value('name'), email: value('email'), password: value('password'), ...(invite ? { invite } : {}) }); setMessage('Check your email for a verification link.'); }
      if (path === '/login') {
        await auth.submit('sign-in/email', { email: value('email'), password: value('password') });
        const target: unknown = location.state?.returnTo;
        navigate(typeof target === 'string' && /^\/(?!\/)/.test(target) ? target : '/projects', { replace: true });
      }
      if (path === '/forgot-password') { await auth.submit('request-password-reset', { email: value('email') }); setMessage("If an account exists, we've sent a link"); }
      if (path === '/reset-password') { await auth.submit('reset-password', { token, newPassword: value('password') }); setMessage('Password reset. You can log in.'); navigate('/login', { replace: true }); }
      if (path === '/logout') { await auth.submit('sign-out'); navigate('/login', { replace: true }); }
      form.reset();
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
      setMessage(status === 403 && path === '/register' ? 'This invitation is invalid or has expired' : status === 429 ? 'Too many requests. Please try again shortly.' : path === '/login' ? 'Unable to log in. Check your email and password.' : 'Unable to complete this request. Please try again.');
    }
    finally { setPending(false); }
  }
  if (!auth) return null;
  if (path === '/verify-email') return <><p role="status">{message || (token ? 'Verifying email…' : 'Open the verification link from your email.')}</p><Link to="/login">Log in</Link></>;
  return <>
    <form onSubmit={event => void submit(event)} className="grid max-w-md gap-3">
      {path === '/register' && <label>Name<input name="name" required autoComplete="name" /></label>}
      {['/register', '/login', '/forgot-password'].includes(path) && <label>Email<input name="email" type="email" required autoComplete="email" /></label>}
      {['/register', '/login', '/reset-password'].includes(path) && <label>{path === '/reset-password' ? 'New password' : 'Password'}<input name="password" type="password" minLength={8} required autoComplete={path === '/login' ? 'current-password' : 'new-password'} /></label>}
      {['/register', '/reset-password'].includes(path) && <label>Confirm password<input name="confirm" type="password" required autoComplete="new-password" /></label>}
      {path === '/logout' && <p>End your current session?</p>}
      {path === '/reset-password' && !token && <p>Open the reset link from your email.</p>}
      <Button type="submit" variant="primary" disabled={pending || (path === '/reset-password' && !token)}>{pending ? 'Please wait…' : ({ '/register': 'Create account', '/login': 'Log in', '/forgot-password': 'Send reset link', '/reset-password': 'Reset password', '/logout': 'Confirm log out' }[path])}</Button>
    </form>
    {message && <p role="status">{message}</p>}
    <div className="link-list"><Link to="/login">Log in</Link><Link to="/register">Register</Link><Link to="/forgot-password">Forgot password</Link></div>
  </>;
}
