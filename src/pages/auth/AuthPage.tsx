import { useDemoAccount } from '../../app/useDemoAccount';
import { useTrackerData } from '../../data/hooks';
import { LiveAuthScreen } from './LiveAuthScreen';
import { useLocation } from 'react-router';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { LoginScreen } from './LoginScreen';
import { LogoutScreen } from './LogoutScreen';
import { RegisterScreen } from './RegisterScreen';
import { ResetPasswordScreen } from './ResetPasswordScreen';
import { VerifyEmailScreen } from './VerifyEmailScreen';

export function AuthPage({ title }: { title: string }) {
  const { pathname } = useLocation();
  const { auth } = useTrackerData();
  const demo = useDemoAccount();
  if (!demo && auth) return <><p className="eyebrow">Account</p><h1>{title}</h1><LiveAuthScreen key={pathname} /></>;
  return <>
    <p className="eyebrow">Simulated account</p>
    <h1>{title}</h1>
    {pathname === '/login' && <LoginScreen />}
    {pathname === '/register' && <RegisterScreen />}
    {pathname === '/verify-email' && <VerifyEmailScreen />}
    {pathname === '/forgot-password' && <ForgotPasswordScreen />}
    {pathname === '/reset-password' && <ResetPasswordScreen />}
    {pathname === '/logout' && <LogoutScreen />}
  </>;
}
