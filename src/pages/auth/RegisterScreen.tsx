import { Link } from 'react-router';
import { DemoEmailField } from './DemoEmailField';
import { DisabledPasswordField } from './DisabledPasswordField';
import { SimulatedNotice } from './SimulatedNotice';

export function RegisterScreen() {
  return <>
    <SimulatedNotice />
    <p>Registration does not create an account.</p>
    <DemoEmailField label="Email" />
    <DisabledPasswordField label="Password" />
    <DisabledPasswordField label="Confirm password" />
    <div className="link-list">
      <Link className="button button-primary" to="/verify-email">Create account</Link>
      <Link to="/login">Log in</Link>
    </div>
  </>;
}
