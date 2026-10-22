import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mobileCss } from '../../test/mobileTargets';
import { ActivityHeatmap } from './ActivityHeatmap';

function installScrollerMetrics(metrics: { scrollWidth: number; clientWidth: number }) {
  const host = HTMLElement.prototype;
  const previous = {
    scrollWidth: Object.getOwnPropertyDescriptor(host, 'scrollWidth'),
    clientWidth: Object.getOwnPropertyDescriptor(host, 'clientWidth'),
  };
  Object.defineProperty(host, 'scrollWidth', { configurable: true, get: () => metrics.scrollWidth });
  Object.defineProperty(host, 'clientWidth', { configurable: true, get: () => metrics.clientWidth });
  return () => {
    for (const key of ['scrollWidth', 'clientWidth'] as const) {
      const descriptor = previous[key];
      if (descriptor) Object.defineProperty(host, key, descriptor);
      else Reflect.deleteProperty(host, key);
    }
  };
}

describe('activity heatmap length', () => {
  it('renders 7-, 31-, and 365-day windows with the end cell, Monday rows, a month, and no page scroll', () => {
    expect(mobileCss).toContain('.public-page { max-width: 100%; overflow-x: hidden; }');
    expect(mobileCss).toContain('.public-scroll { max-width: 100%; min-width: 0; overflow-x: auto; }');
    const windows = [
      { start: '2026-10-13', end: '2026-10-19', days: 7, last: 'Oct 19, 2026: 0 runs', row: '0', month: 'Oct' },
      { start: '2026-10-12', end: '2026-10-18', days: 7, last: 'Oct 18, 2026: 0 runs', row: '6', month: 'Oct' },
      { start: '2026-10-27', end: '2026-11-02', days: 7, last: 'Nov 2, 2026: 0 runs', row: '0', month: 'Nov' },
      { start: '2026-10-01', end: '2026-10-31', days: 31, last: 'Oct 31, 2026: 0 runs', row: '5', month: 'Oct' },
      { start: '2025-10-22', end: '2026-10-21', days: 365, last: 'Oct 21, 2026: 0 runs', row: '2', month: 'Oct' },
    ];
    for (const window of windows) {
      const view = render(<ActivityHeatmap activity={{ start: window.start, end: window.end, counts: Array(window.days).fill(0) }} />);
      const cells = view.getAllByRole('img');
      expect(cells).toHaveLength(window.days);
      const last = cells.at(-1);
      expect(last).toHaveAttribute('aria-label', window.last);
      expect(last).toHaveAttribute('data-date', window.end);
      expect(last).toHaveAttribute('data-row', window.row);
      expect(last?.closest('.public-scroll')).not.toBeNull();
      const months = [...view.container.querySelectorAll('.public-heat-months span')].map(node => node.textContent);
      expect(months).toContain(window.month);
      expect(document.documentElement.scrollLeft).toBe(0);
      expect(document.body.scrollLeft).toBe(0);
      view.unmount();
    }
    const monday = render(<ActivityHeatmap activity={{ start: '2026-10-12', end: '2026-10-18', counts: Array(7).fill(0) }} />);
    expect(monday.container.querySelector('[data-date="2026-10-12"]')).toHaveAttribute('data-row', '0');
    monday.unmount();
  });
});

describe('activity heatmap scroll', () => {
  it('opens on the latest week and follows a later activity.end', () => {
    const metrics = { scrollWidth: 810, clientWidth: 748 };
    const restore = installScrollerMetrics(metrics);
    try {
      const activity = { start: '2025-10-22', end: '2026-10-21', counts: Array(365).fill(0) };
      const view = render(<ActivityHeatmap activity={activity} />);
      const scroller = view.container.querySelector('.public-scroll');
      if (!(scroller instanceof HTMLElement)) throw new Error('missing heatmap scroller');
      const labels = [...view.container.querySelectorAll('.public-heat-months span')].map(node => node.textContent);
      expect(labels[0]).toBe('');
      expect(labels[1]).toBe('Nov');
      expect(labels.filter(label => label === 'Oct')).toEqual(['Oct']);
      expect(scroller.scrollLeft).toBe(metrics.scrollWidth - metrics.clientWidth);
      expect(document.documentElement.scrollLeft).toBe(0);
      expect(document.body.scrollLeft).toBe(0);
      scroller.scrollLeft = 12;
      view.rerender(<ActivityHeatmap activity={activity} />);
      expect(scroller.scrollLeft).toBe(12);
      metrics.scrollWidth = 900;
      metrics.clientWidth = 343;
      view.rerender(<ActivityHeatmap activity={{ ...activity, end: '2026-10-22' }} />);
      expect(scroller.scrollLeft).toBe(900 - 343);
      expect(document.documentElement.scrollLeft).toBe(0);
    } finally {
      restore();
    }
  });
});
