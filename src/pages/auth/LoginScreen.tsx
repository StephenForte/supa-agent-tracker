import { Link } from 'react-router';
import { DemoEmailField } from './DemoEmailField';
import { DisabledPasswordField } from './DisabledPasswordField';
import { SimulatedNotice } from './SimulatedNotice';

export function LoginScreen() {
  return <>
    <SimulatedNotice />
    <p>Sign-in does not check a password in this demo.</p>
    <DemoEmailField label="Email" />
    <DisabledPasswordField label="Password" />
    <div className="link-list">
      <Link className="button button-primary" to="/projects">Continue as demo operator</Link>
      <Link to="/register">Register</Link>
      <Link to="/forgot-password">Forgot password</Link>
    </div>
  </>;
}
