import { useLocation } from 'react-router';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { LoginScreen } from './LoginScreen';
import { LogoutScreen } from './LogoutScreen';
import { RegisterScreen } from './RegisterScreen';
import { ResetPasswordScreen } from './ResetPasswordScreen';
import { VerifyEmailScreen } from './VerifyEmailScreen';

export function AuthPage({ title }: { title: string }) {
  const { pathname } = useLocation();
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
