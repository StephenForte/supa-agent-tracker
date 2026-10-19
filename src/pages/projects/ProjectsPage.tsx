import { useDemoAccount } from '../../app/useDemoAccount';
import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { useNow } from '../../domain/clock';
import { projectsShownLine } from '../../domain/format';
import { defaultFilters, describeFilters, filterOptions, projectSearchParams, readProjectControls, selectProjects } from '../../domain/projects/dashboard';
import { ProjectCard } from '../../features/projects/ProjectCard';
import { ProjectFilters } from '../../features/projects/ProjectFilters';

export function ProjectsPage() {
  const isDemo = useDemoAccount();
  const source = useTrackerData();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const [attempt, setAttempt] = useState(0);
  const { filters, sort } = readProjectControls(params);
  function commit(nextFilters: typeof filters, nextSort: typeof sort) {
    const next = projectSearchParams(params, nextFilters, nextSort);
    if (next.toString() === params.toString()) return;
    const textOnly = nextFilters.text !== filters.text && nextSort === sort && nextFilters.lifecycle === filters.lifecycle && nextFilters.type === filters.type && nextFilters.activity === filters.activity && nextFilters.harness === filters.harness && nextFilters.tag === filters.tag;
    setParams(next, { replace: textOnly });
  }
  const result = useSourceQuery(source, useCallback(async () => {
    void attempt;
    const [projects, runs, agents] = await Promise.all([source.listProjects(), source.listRuns(), source.listAgents()]);
    return { projects, runs, agents };
  }, [source, attempt]));
  const demo = isDemo ? params.get('demo') : null;
  let body;
  if (demo === 'loading' || (demo !== 'error' && demo !== 'empty' && result.status === 'loading')) body = <p role="status">Loading projects…</p>;
  else if (demo === 'error' || (demo !== 'empty' && result.status === 'error')) body = <ErrorState message={demo === 'error' ? 'Demo: projects could not be loaded.' : result.status === 'error' ? result.error.message : 'Unable to load projects.'} onRetry={demo === 'error' ? undefined : () => setAttempt(value => value + 1)} />;
  else if (demo === 'empty' || (result.status === 'ready' && !result.data.projects.length)) body = <EmptyState title="No projects yet"><p>Create your first project to track agent work.</p><Link to="/projects/new">Create a project</Link></EmptyState>;
  else if (result.status === 'ready') {
    const { projects, runs, agents } = result.data;
    const visible = selectProjects(projects, runs, agents, filters, sort, now);
    const visibleIds = new Set(visible.map(project => project.id));
    const hiddenArchived = projects.filter(project => project.lifecycle === 'archived' && !visibleIds.has(project.id)).length;
    const hiddenOther = projects.length - visible.length - hiddenArchived;
    body = <><ProjectFilters filters={filters} onChange={next => commit(next, sort)} onClear={() => commit(defaultFilters, sort)} sort={sort} onSort={next => commit(filters, next)} {...filterOptions(projects, runs)} />
      <p role="status" className="text-sm text-slate-600">{projectsShownLine(visible.length, hiddenArchived, hiddenOther)}</p>
      {visible.length ? <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">{visible.map(project => <ProjectCard key={project.id} project={project} runs={runs} agents={agents} now={now} />)}</div> : <EmptyState title="No matching projects"><p>Active filters: {describeFilters(filters).join(' · ')}</p><Button onClick={() => commit(defaultFilters, sort)}>Clear filters</Button></EmptyState>}</>;
  }
  return <><div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">Your workspace</p><h1>Projects</h1><p className="mobile-description text-slate-600">See what is running, what needs review, and your next step.</p></div><Link className="button button-primary" to="/projects/new">Create a project</Link></div>{demo && ['loading', 'error', 'empty'].includes(demo) && <p className="text-sm">Demo state: {demo}. <Link to="/projects">Return to projects</Link></p>}{body}</>;
}
