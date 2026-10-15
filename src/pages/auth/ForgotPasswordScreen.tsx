import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { DemoEmailField } from './DemoEmailField';
import { SimulatedNotice } from './SimulatedNotice';

export function ForgotPasswordScreen() {
  const [sent, setSent] = useState(false);
  return <>
    <SimulatedNotice />
    <p>The response is the same whether or not an account exists. The address is not sent anywhere.</p>
    <DemoEmailField label="Email" />
    <div className="mt-4"><Button variant="primary" onClick={() => setSent(true)}>Send reset link</Button></div>
    {sent && <p role="status">If an account exists, we've sent a link</p>}
    <div className="link-list">
      {sent && <Link to="/reset-password">Reset password</Link>}
      <Link to="/login">Log in</Link>
    </div>
  </>;
}
