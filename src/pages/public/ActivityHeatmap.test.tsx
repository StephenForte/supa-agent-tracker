import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
