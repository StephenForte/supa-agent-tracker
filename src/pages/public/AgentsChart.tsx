import type { PublicProfilePayload } from '../../data/public/types';
import { calendarDaysInclusive, formatCalendarLabel } from '../../domain/public/calendar';
import { formatAgentRunHeading, harnessLegend, harnessPeriodTotal } from '../../domain/public/agents';

const SLOT = 10;
const HEIGHT = 128;
const PLOT_BOTTOM = 120;
const PLOT_HEIGHT = 104;

export function AgentsChart({ harnesses }: { harnesses: PublicProfilePayload['harnesses'] }) {
  const dates = calendarDaysInclusive(harnesses.start, harnesses.end);
  const width = 16 + dates.length * SLOT;
  const legend = harnessLegend(harnesses.series);
  const heading = formatAgentRunHeading(harnessPeriodTotal(harnesses.series));
  let max = 0;
  for (let day = 0; day < dates.length; day += 1) {
    const sum = harnesses.series.reduce((total, series) => total + (series.counts[day] ?? 0), 0);
    if (sum > max) max = sum;
  }
  const bars = dates.map((date, day) => {
    let y = PLOT_BOTTOM;
    return <g key={date} data-date={date}>{legend.map((entry, seriesIndex) => {
      const count = harnesses.series.find(series => series.harness === entry.harness)?.counts[day] ?? 0;
      const bar = max === 0 ? 0 : (count / max) * PLOT_HEIGHT;
      y -= bar;
      return bar > 0 ? <rect key={entry.harness} x={8 + day * SLOT} y={y} width={8} height={bar} className={`public-series-${seriesIndex % 5}`} /> : null;
    })}</g>;
  });
  return <section aria-labelledby="agents-chart-heading">
    <h2 id="agents-chart-heading">{heading}</h2>
    <p className="text-sm text-slate-600">{formatCalendarLabel(harnesses.start)} – {formatCalendarLabel(harnesses.end)}</p>
    <svg viewBox={`0 0 ${width} ${HEIGHT}`} className="public-chart" role="img" aria-label={heading} width="100%" height="160" preserveAspectRatio="none">
      <line x1="8" x2={width - 8} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} stroke="currentColor" strokeOpacity="0.35" />
      {bars}
    </svg>
    <ul className="public-legend">{legend.map((entry, index) => <li key={`${entry.harness}-${index}`}><span className={`public-swatch public-series-${index % 5}`} aria-hidden="true" />{entry.harness} ({entry.total})</li>)}</ul>
  </section>;
}
