import { Link } from 'react-router';
import { SimulatedNotice } from './SimulatedNotice';

export function VerifyEmailScreen() {
  return <>
    <SimulatedNotice />
    <p>Email verification is simulated. No message was sent.</p>
    <div className="link-list"><Link to="/login">Log in</Link></div>
  </>;
}
