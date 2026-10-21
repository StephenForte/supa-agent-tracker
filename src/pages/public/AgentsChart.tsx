import type { ReactNode } from 'react';
import type { PublicProfilePayload } from '../../data/public/types';
import { formatCalendarLabel } from '../../domain/public/calendar';
import { formatAgentRunHeading, harnessLegend, harnessPeriodTotal } from '../../domain/public/agents';

const DAYS = 30;
const SLOT = 10;
const WIDTH = 16 + DAYS * SLOT;
const HEIGHT = 128;
const PLOT_BOTTOM = 120;
const PLOT_HEIGHT = 104;

export function AgentsChart({ harnesses }: { harnesses: PublicProfilePayload['harnesses'] }) {
  const legend = harnessLegend(harnesses.series);
  const heading = formatAgentRunHeading(harnessPeriodTotal(harnesses.series));
  let max = 0;
  for (let day = 0; day < DAYS; day += 1) {
    const sum = harnesses.series.reduce((total, series) => total + (series.counts[day] ?? 0), 0);
    if (sum > max) max = sum;
  }
  const bars: ReactNode[] = [];
  for (let day = 0; day < DAYS; day += 1) {
    let y = PLOT_BOTTOM;
    legend.forEach((entry, seriesIndex) => {
      const count = harnesses.series.find(series => series.harness === entry.harness)?.counts[day] ?? 0;
      const bar = max === 0 ? 0 : (count / max) * PLOT_HEIGHT;
      y -= bar;
      if (bar > 0) bars.push(<rect key={`${entry.harness}-${day}`} x={8 + day * SLOT} y={y} width={8} height={bar} className={`public-series-${seriesIndex % 5}`} />);
    });
  }
  return <section aria-labelledby="agents-chart-heading">
    <h2 id="agents-chart-heading">{heading}</h2>
    <p className="text-sm text-slate-600">{formatCalendarLabel(harnesses.start)} – {formatCalendarLabel(harnesses.end)}</p>
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="public-chart" role="img" aria-label={heading} width="100%">
      <line x1="8" x2={WIDTH - 8} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} stroke="currentColor" strokeOpacity="0.35" />
      {bars}
    </svg>
    <ul className="public-legend">{legend.map((entry, index) => <li key={`${entry.harness}-${index}`}><span className={`public-swatch public-series-${index % 5}`} aria-hidden="true" />{entry.harness} ({entry.total})</li>)}</ul>
  </section>;
}
