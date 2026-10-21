import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app/routes';
import { DataProvider } from '../../data/hooks';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { createClock } from '../../domain/clock';
import { profileMessages } from '../../domain/public/profile';
import { AVATAR_NEEDS_LIVE } from '../../data/public/avatar';

afterEach(() => { vi.restoreAllMocks(); });

function mount() {
  const sources = createDemoSources({ clock: createClock(Date.parse('2026-10-21T16:00:00Z')) });
  const router = createMemoryRouter(routes, { initialEntries: ['/settings'] });
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  return { sources, user: userEvent.setup() };
}

describe('public profile settings', () => {
  it('preselects the browser zone only while the saved profile is still the UTC default', async () => {
    const original = Intl.DateTimeFormat.prototype.resolvedOptions;
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (this: Intl.DateTimeFormat) {
      return { ...original.call(this), timeZone: 'Europe/Paris' };
    });
    mount();
    expect(await screen.findByLabelText('Timezone')).toHaveValue('Europe/Paris');
  });

  it('keeps a saved UTC timezone when something else is already set', async () => {
    const original = Intl.DateTimeFormat.prototype.resolvedOptions;
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (this: Intl.DateTimeFormat) {
      return { ...original.call(this), timeZone: 'Europe/Paris' };
    });
    const sources = createDemoSources({ clock: createClock(Date.parse('2026-10-21T16:00:00Z')) });
    await sources.tracker.updateAccount({ publicProfile: { name: 'Ada', bio: null, github: null, x: null, linkedin: null, timezone: 'UTC' } });
    const router = createMemoryRouter(routes, { initialEntries: ['/settings'] });
    render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
    expect(await screen.findByLabelText('Timezone')).toHaveValue('UTC');
  });

  it('shows a validation message for each field and does not save', async () => {
    const { sources, user } = mount();
    expect(await screen.findByRole('heading', { name: 'Public profile' })).toBeVisible();
    expect(screen.getByText(AVATAR_NEEDS_LIVE)).toBeVisible();
    expect(screen.queryByLabelText('Avatar')).not.toBeInTheDocument();
    const before = await sources.tracker.getAccount();
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'x'.repeat(61) } });
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'y'.repeat(161) } });
    fireEvent.change(screen.getByLabelText('GitHub'), { target: { value: '-nope' } });
    fireEvent.change(screen.getByLabelText('X'), { target: { value: 'has space' } });
    fireEvent.change(screen.getByLabelText('LinkedIn'), { target: { value: 'ab' } });
    fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'Not/AZone' } });
    expect(screen.getByText('161/160')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    for (const message of Object.values(profileMessages)) expect(screen.getByText(message)).toBeVisible();
    expect(await sources.tracker.getAccount()).toEqual(before);
  });

  it('saves the profile against the demo store and links to the public page', async () => {
    const { sources, user } = mount();
    expect(await screen.findByLabelText('Profile name')).toBeVisible();
    await user.type(screen.getByLabelText('Profile name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('Bio'), 'Computing');
    await user.type(screen.getByLabelText('GitHub'), 'ada');
    const zone = (screen.getByLabelText('Timezone') as HTMLSelectElement).value;
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Public profile saved.')).toBeVisible();
    expect((await sources.tracker.getAccount()).publicProfile).toMatchObject({ name: 'Ada Lovelace', bio: 'Computing', github: 'ada', timezone: zone });
    await user.type(screen.getByRole('textbox', { name: 'Public page handle' }), 'Demo-Ops');
    await user.click(screen.getByRole('button', { name: 'Save handle' }));
    expect(await screen.findByRole('link', { name: 'View public profile' })).toHaveAttribute('href', '/public/demo-ops');
  });
});
