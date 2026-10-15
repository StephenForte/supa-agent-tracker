import { Link } from 'react-router';
import { Placeholder } from '../../app/Placeholder';
export function ProjectsPage() { return <Placeholder title="Projects" owner="T0-02"><div className="slot"><h2>Project workspace</h2><p>Cards, filters and project forms will be implemented here.</p><div className="link-list"><Link to="/projects/new">Create a project</Link><Link to="/projects/prj_offers">Open Offers fixture</Link><Link to="/projects/prj_dashboard">Open Dashboard fixture</Link><Link to="/projects/prj_weather">Open Weather fixture</Link></div></div></Placeholder>; }
