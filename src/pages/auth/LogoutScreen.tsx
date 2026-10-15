import { Link } from 'react-router';
import { SimulatedNotice } from './SimulatedNotice';

export function LogoutScreen() {
  return <>
    <SimulatedNotice />
    <p>This confirms leaving the demo. There is no live session to end.</p>
    <div className="link-list">
      <Link className="button button-primary" to="/login">Confirm log out</Link>
      <Link to="/projects">Cancel</Link>
    </div>
  </>;
}
