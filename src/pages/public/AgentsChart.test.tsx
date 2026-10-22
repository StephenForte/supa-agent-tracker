import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentsChart } from './AgentsChart';

describe('harness chart window', () => {
  it.each([7, 12, 30])('fills the plot with %i daily slots, including zero days and the end date', days => {
    const start = '2026-10-01';
    const end = `2026-10-${String(days).padStart(2, '0')}`;
    const counts = Array.from({ length: days }, (_, day) => day);
    const total = counts.reduce((sum, count) => sum + count, 0);
    const { container } = render(<AgentsChart harnesses={{ start, end, series: [
      { harness: 'Other', counts: Array(days).fill(1) },
      { harness: 'Cursor', counts },
    ] }} />);
    const chart = screen.getByRole('img', { name: `${total + days} agent runs` });
    expect(chart).toHaveAttribute('height', '160');
    const slots = [...container.querySelectorAll('g[data-date]')];
    expect(slots).toHaveLength(days);
    expect(slots[0]).toHaveAttribute('data-date', start);
    expect(slots.at(-1)).toHaveAttribute('data-date', end);
    expect(new Set(slots.map(slot => slot.querySelector('rect')?.getAttribute('x'))).size).toBe(days);
    const endBar = slots.at(-1)!.querySelector('rect')!;
    const plotWidth = Number(chart.getAttribute('viewBox')!.split(' ')[2]);
    expect(Number(endBar.getAttribute('x')) + Number(endBar.getAttribute('width'))).toBe(plotWidth - 10);
    expect(screen.getByText(`Oct 1, 2026 – Oct ${days}, 2026`)).toBeVisible();
    expect(within(screen.getByRole('list')).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      `Cursor (${total})`, `Other (${days})`,
    ]);
    const heights = [...container.querySelectorAll('rect')].map(rect => Number(rect.getAttribute('height')));
    expect(heights.every(height => Number.isFinite(height) && height >= 0)).toBe(true);
  });

  it('retains all daily slots for an empty-series window', () => {
    const { container } = render(<AgentsChart harnesses={{ start: '2026-10-01', end: '2026-10-07', series: [] }} />);
    expect(screen.getByRole('img', { name: '0 agent runs' })).toBeVisible();
    expect(container.querySelectorAll('g[data-date]')).toHaveLength(7);
    expect(container.querySelectorAll('rect')).toHaveLength(0);
  });
});
