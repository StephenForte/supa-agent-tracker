import { useLayoutEffect, useRef } from 'react';
import type { PublicProfilePayload } from '../../data/public/types';
import { buildActivityGrid } from '../../domain/public/heatmap';

export function ActivityHeatmap({ activity }: { activity: PublicProfilePayload['activity'] }) {
  const grid = buildActivityGrid(activity);
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollLeft = node.scrollWidth - node.clientWidth;
  }, [activity.end]);
  const columns = `repeat(${grid.columns}, 12px)`;
  return <section aria-labelledby="activity-heading">
    <h2 id="activity-heading">Activity</h2>
    <div className="public-scroll" ref={scroller}>
      <div className="public-heat">
        <div className="public-heat-months" style={{ gridTemplateColumns: columns }}>
          {Array.from({ length: grid.columns }, (_, column) => {
            const month = grid.months.find(item => item.column === column);
            return <span key={column}>{month?.label ?? ''}</span>;
          })}
        </div>
        <div className="public-heat-body">
          <div className="public-heat-days" aria-hidden="true">{['M', '', 'W', '', 'F', '', ''].map((label, index) => <span key={index}>{label}</span>)}</div>
          <div className="public-heat-week">
            {Array.from({ length: grid.leadingBlanks }, (_, index) => <span key={`pad-${index}`} className="public-heat-cell public-heat-0" aria-hidden="true" />)}
            {grid.cells.map(cell => <span key={cell.date} role="img" aria-label={cell.label} data-date={cell.date} data-row={String(cell.row)} className={`public-heat-cell public-heat-${cell.level}`} />)}
          </div>
        </div>
      </div>
    </div>
  </section>;
}
