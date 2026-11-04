import { useCallback } from 'react';
import { Link } from 'react-router';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { boardCounts } from '../../domain/board/board';
export function BoardPreview({ projectId }: { projectId: string }) {
  const source = useTrackerData();
  const result = useSourceQuery(source, useCallback(() => source.listBoardSummaries(), [source]));
  const summary = result.status === 'ready' ? result.data.find(item => item.projectId === projectId) : null;
  return <div className="board-preview" role="group" aria-label="Message board">
    <p className="m-0 font-semibold">Message board</p>
    {result.status === 'loading' ? <p role="status">Loading messages…</p> : result.status === 'error' ? <p role="alert">{result.error.message}</p> : summary ? <>
      <p>{boardCounts(summary)}</p><p className="board-latest" title={summary.latest.title}>{summary.latest.title}</p>
    </> : <p>No open messages</p>}
    <Link to={`/projects/${projectId}#project-board`}>View message board</Link>
  </div>;
}
