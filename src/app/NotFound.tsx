import { Link } from 'react-router';
export function NotFound({ project = false }: { project?: boolean }) { return <><h1>{project ? 'Project not found' : 'Page not found'}</h1><p>{project ? 'This project does not exist in the current demo. Reset demo to restore the fixtures.' : 'The requested page is not part of this demo.'}</p><Link to="/projects">Return to projects</Link></>; }
