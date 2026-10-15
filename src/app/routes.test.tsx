import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './routes';
import { DataProvider } from '../data/hooks';
import { createDemoSources } from '../data/mock/createDemoSources';
import { createClock } from '../domain/clock';
const cases = [
  ['/', 'Projects'], ['/projects', 'Projects'], ['/projects/new', 'New project'],
  ['/projects/prj_offers', 'Offers workspace'], ['/projects/prj_offers?run=run_3', 'Offers workspace'],
  ['/projects/prj_offers/edit', 'Edit project'], ['/agents', 'All agents'],
  ['/settings', 'Account settings'], ['/settings/tokens', 'MCP tokens'], ['/settings/integrations', 'Integration setup'],
  ['/login', 'Log in'], ['/register', 'Register'], ['/verify-email', 'Verify email'],
  ['/forgot-password', 'Forgot password'], ['/reset-password', 'Reset password'], ['/logout', 'Log out'],
  ['/projects/unknown', 'Project not found'], ['/projects/unknown/edit', 'Project not found'], ['/unknown/path', 'Page not found'],
];
describe('D-007 route smoke', () => {
  it.each(cases)('%s shows its heading and persistent demo indicator', async (path, heading) => {
    const sources = createDemoSources({ clock: createClock(Date.parse('2026-10-14T20:00:00Z')) });
    const router = createMemoryRouter(routes, { initialEntries: [path!] });
    render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
    expect(await screen.findByRole('heading', { level: 1, name: heading! })).toBeVisible();
    expect(screen.getByText('Demo — simulated data')).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reset demo' })).toBeVisible();
    router.dispose();
  });
});
