import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { useNow } from '../../domain/clock';
import { defaultFilters, describeFilters, filterOptions, selectProjects, type ProjectSort } from '../../domain/projects/dashboard';
import { ProjectCard } from '../../features/projects/ProjectCard';
import { ProjectFilters } from '../../features/projects/ProjectFilters';

export function ProjectsPage() {
  const source = useTrackerData();
  const now = useNow();
  const [params] = useSearchParams();
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState(defaultFilters);
  const [sort, setSort] = useState<ProjectSort>('active');
  const result = useSourceQuery(source, useCallback(async () => {
    void attempt;
    const [projects, runs, agents] = await Promise.all([source.listProjects(), source.listRuns(), source.listAgents()]);
    return { projects, runs, agents };
  }, [source, attempt]));
  const demo = params.get('demo');
  let body;
  if (demo === 'loading' || (demo !== 'error' && demo !== 'empty' && result.status === 'loading')) body = <p role="status">Loading projects…</p>;
  else if (demo === 'error' || (demo !== 'empty' && result.status === 'error')) body = <ErrorState message={demo === 'error' ? 'Demo: projects could not be loaded.' : result.status === 'error' ? result.error.message : 'Unable to load projects.'} onRetry={demo === 'error' ? undefined : () => setAttempt(value => value + 1)} />;
  else if (demo === 'empty' || (result.status === 'ready' && !result.data.projects.length)) body = <EmptyState title="No projects yet"><p>Create your first project to track agent work.</p><Link to="/projects/new">Create a project</Link></EmptyState>;
  else if (result.status === 'ready') {
    const { projects, runs, agents } = result.data;
    const visible = selectProjects(projects, runs, agents, filters, sort, now);
    body = <><ProjectFilters filters={filters} onChange={setFilters} onClear={() => setFilters(defaultFilters)} sort={sort} onSort={setSort} {...filterOptions(projects, runs)} />
      <p role="status" className="text-sm text-slate-600">{visible.length} of {projects.length} projects shown</p>
      {visible.length ? <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">{visible.map(project => <ProjectCard key={project.id} project={project} runs={runs} agents={agents} now={now} />)}</div> : <EmptyState title="No matching projects"><p>Active filters: {describeFilters(filters).join(' · ')}</p><Button onClick={() => setFilters(defaultFilters)}>Clear filters</Button></EmptyState>}</>;
  }
  return <><div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">Your workspace</p><h1>Projects</h1><p className="text-slate-600">See what is running, what needs review, and your next step.</p></div><Link className="button button-primary" to="/projects/new">Create a project</Link></div>{demo && ['loading', 'error', 'empty'].includes(demo) && <p className="text-sm">Demo state: {demo}. <Link to="/projects">Return to projects</Link></p>}{body}</>;
}
