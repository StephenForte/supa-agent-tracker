import { expect } from 'vitest';
import { readFileSync } from 'node:fs';
export const mobileCss = readFileSync('src/styles/app.css', 'utf8');

/** jsdom has no geometry. Prove coverage by the actual shared CSS selector/token,
 * then measure real rectangles in Chrome at 375x812 during acceptance. */
export function expectMobileTapTargets(root: HTMLElement) {
  const mobile = mobileCss.slice(mobileCss.lastIndexOf('@media (max-width: 767px)'));
  expect(mobile).toContain('.app-shell { --mobile-tap-target: 44px; }');
  const rule = mobile.match(/([^{}]+)\{ min-height: var\(--mobile-tap-target\); \}/);
  expect(rule, 'mobile sizing rule must exist').not.toBeNull();
  const selector = rule![1]!.trim();
  const controls = [...root.querySelectorAll<HTMLElement>('a, button, input, select, textarea, summary')];
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    expect(control.matches(selector), `${control.tagName}: ${control.textContent}`).toBe(true);
    expect(control.style.minHeight).toBe('');
    expect(control.style.transform).toBe('');
  }
  expect(mobile).toContain('.app-shell :is(a, button, summary) { display: inline-flex; align-items: center; }');
}
