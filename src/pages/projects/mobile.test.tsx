import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { routes } from '../../app/routes';
import { DataProvider } from '../../data/hooks';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { expectMobileTapTargets } from '../../test/mobileTargets';
import { mobileCss as css } from '../../test/mobileTargets';
const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.unstubAllGlobals(); });
function show(path: string, width = 375) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: width >= 768, media: query, addEventListener() {}, removeEventListener() {} })));
  const sources = createDemoSources();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  disposers.push(sources.dispose, () => router.dispose());
  const result = render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  return { ...result, router, sources };
}
for (const [path, heading] of [['/projects', 'Projects'], ['/agents', 'All agents']] as const) {
  it(`${heading}: collapses mobile filters, opens by keyboard, counts defaults and covers tap targets`, async () => {
    const { container } = show(path);
    await screen.findByRole('heading', { name: heading, level: 1 });
    const toggle = await screen.findByRole('button', { name: 'Filters' });
    expect(document.title).toBe('Supa Agent Tracker · Demo');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const content = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(content).toHaveClass('filter-content');
    expect(content).not.toHaveClass('is-open');
    expect(css).toContain('.filter-content:not(.is-open) { display: none; }');
    toggle.focus();
    await userEvent.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(content).toHaveClass('is-open');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'T0' } });
    expect(toggle).toHaveTextContent('Filters (1)');
    expectMobileTapTargets(container);
  });
  it(`${heading}: keeps desktop filters expanded via the mobile-only CSS rule`, async () => {
    show(path, 768);
    const toggle = await screen.findByRole('button', { name: 'Filters' });
    expect(toggle).toHaveClass('mobile-filter-toggle');
    expect(css).toContain('.mobile-filter-toggle, .project-jumps { display: none; }');
    const prefix = css.slice(0, css.lastIndexOf('@media (max-width: 767px)'));
    expect(prefix).not.toContain('.filter-content:not(.is-open)');
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    if (path === '/agents') expect(screen.getByRole('table', { name: /Run executions/ })).toBeInTheDocument();
  });
}
it('project page links to all three sections and keeps expanded actions reachable with mobile targets', async () => {
  const { container } = show('/projects/prj_offers');
  await screen.findByRole('heading', { level: 1, name: 'Offers workspace' });
  const jumps = screen.getByRole('navigation', { name: 'Project sections' });
  for (const [name, id] of [['Runs', 'project-runs'], ['Next steps', 'project-steps'], ['Notes', 'project-notes']]) {
    expect(within(jumps).getByRole('link', { name })).toHaveAttribute('href', `#${id}`);
    expect(document.getElementById(id!)).not.toBeNull();
  }
  expectMobileTapTargets(container);
  const card = document.querySelector<HTMLElement>('[data-run-id="run_1"]')!;
  expect(within(card).queryByRole('button', { name: /close run/ })).toBeNull();
  fireEvent.click(within(card).getByRole('button', { expanded: false }));
  expect(within(card).getByRole('button', { name: /close run/ })).toBeInTheDocument();
  expectMobileTapTargets(container);
});
it('keeps the PR hit area in a separate grid column from the expansion control', async () => {
  show('/projects/prj_offers');
  await screen.findByRole('heading', { level: 1, name: 'Offers workspace' });
  const card = document.querySelector<HTMLElement>('[data-run-id="run_3"]')!;
  expect(card.querySelector('.run-card-toggle')?.parentElement).toBe(card.querySelector('.run-card-pr')?.parentElement);
  expect(css).toMatch(/\.run-card-summary\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
  expect(css).not.toMatch(/\.run-card-pr\s*\{[^}]*position:\s*absolute/);
});
