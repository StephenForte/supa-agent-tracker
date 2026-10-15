import { Link } from 'react-router';
import { DisabledPasswordField } from './DisabledPasswordField';
import { SimulatedNotice } from './SimulatedNotice';

export function ResetPasswordScreen() {
  return <>
    <SimulatedNotice />
    <p>Password reset is simulated. These fields stay empty and are not stored.</p>
    <DisabledPasswordField label="New password" />
    <DisabledPasswordField label="Confirm new password" />
    <div className="link-list"><Link to="/login">Log in</Link></div>
  </>;
}
