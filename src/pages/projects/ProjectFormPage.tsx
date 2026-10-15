import { useCallback } from 'react';
import { useParams } from 'react-router';
import { Placeholder } from '../../app/Placeholder';
import { NotFound } from '../../app/NotFound';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { ErrorState } from '../../components/ui/ErrorState';
export function ProjectFormPage() {
  const { projectId } = useParams();
  const source = useTrackerData();
  const result = useSourceQuery(source, useCallback(() => projectId ? source.getProject(projectId) : Promise.resolve(null), [projectId, source]));
  if (!projectId) return <Placeholder title="New project" owner="T0-02" />;
  if (result.status === 'loading') return <p role="status">Loading project…</p>;
  if (result.status === 'error') return <ErrorState message={result.error.message} />;
  if (!result.data) return <NotFound project />;
  return <Placeholder title="Edit project" owner="T0-02"><p>{result.data.name}</p></Placeholder>;
}
