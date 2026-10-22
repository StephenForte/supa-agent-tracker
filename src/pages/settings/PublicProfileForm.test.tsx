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

  it('shows what each field expects before typing', async () => {
    mount();
    expect(await screen.findByLabelText('GitHub')).toHaveAttribute('placeholder', 'Your GitHub username, e.g. octocat. Not the full URL.');
    expect(screen.getByLabelText('GitHub')).toHaveAttribute('aria-describedby', 'profile-github-hint');
    expect(screen.getByText('Your GitHub username, e.g. octocat. Not the full URL.')).toBeVisible();
    expect(screen.getByLabelText('X')).toHaveAttribute('placeholder', 'Your X handle without the @, e.g. jack.');
    expect(screen.getByLabelText('X')).toHaveAttribute('aria-describedby', 'profile-x-hint');
    expect(screen.getByText('Your X handle without the @, e.g. jack.')).toBeVisible();
    expect(screen.getByLabelText('LinkedIn')).toHaveAttribute('placeholder', 'The part after linkedin.com/in/, e.g. jane-doe.');
    expect(screen.getByLabelText('LinkedIn')).toHaveAttribute('aria-describedby', 'profile-linkedin-hint');
    expect(screen.getByText('The part after linkedin.com/in/, e.g. jane-doe.')).toBeVisible();
    expect(screen.getByLabelText('Profile name')).toHaveAttribute('aria-describedby', 'profile-name-hint');
    expect(screen.getByText('Up to 60 characters.')).toBeVisible();
    expect(screen.getByLabelText('Bio')).toHaveAttribute('aria-describedby', 'profile-bio-hint profile-bio-count');
    expect(screen.getByText('Up to 160 characters.')).toBeVisible();
    expect(screen.getByText('0/160')).toBeVisible();
  });

  it('puts a red summary next to save, marks the fields, and focuses the first invalid one', async () => {
    const { sources, user } = mount();
    expect(await screen.findByLabelText('GitHub')).toBeVisible();
    const before = await sources.tracker.getAccount();
    fireEvent.change(screen.getByLabelText('GitHub'), { target: { value: 'https://gitlab.com/octocat' } });
    fireEvent.change(screen.getByLabelText('X'), { target: { value: 'has space' } });
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    const button = screen.getByRole('button', { name: 'Save profile' });
    const summary = button.nextElementSibling;
    expect(summary).toHaveTextContent('Not saved: fix GitHub and X.');
    expect(summary).toHaveAttribute('role', 'alert');
    expect(summary?.closest('.profile-save-row')).toBe(button.parentElement);
    expect(summary).toHaveClass('profile-save-error');
    const github = screen.getByLabelText('GitHub');
    expect(github).toHaveAttribute('aria-invalid', 'true');
    expect(github).toHaveClass('profile-invalid');
    expect(github).toHaveAttribute('aria-describedby', 'profile-github-hint profile-github-error');
    expect(github).toHaveValue('https://gitlab.com/octocat');
    expect(github).toHaveFocus();
    expect(screen.getByText(profileMessages.github)).toHaveClass('profile-field-error');
    expect(screen.getByText(profileMessages.x)).toHaveClass('profile-field-error');
    expect(await sources.tracker.getAccount()).toEqual(before);
  });

  it('shows a server error with no field in the same red summary', async () => {
    const { sources, user } = mount();
    expect(await screen.findByRole('button', { name: 'Save profile' })).toBeVisible();
    vi.spyOn(sources.tracker, 'updateAccount').mockResolvedValue({ status: 'invalid', message: 'The profile could not be stored.' });
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    const summary = await screen.findByText('The profile could not be stored.');
    const button = screen.getByRole('button', { name: 'Save profile' });
    expect(summary).toBe(button.nextElementSibling);
    expect(summary).toHaveAttribute('role', 'alert');
    expect(summary).toHaveClass('profile-save-error');
    expect(screen.getByLabelText('GitHub')).not.toHaveAttribute('aria-invalid');
  });

  it('saves a bare handle from a leading @ or a profile URL', async () => {
    const { sources, user } = mount();
    expect(await screen.findByLabelText('GitHub')).toBeVisible();
    fireEvent.change(screen.getByLabelText('GitHub'), { target: { value: 'https://github.com/octocat/' } });
    fireEvent.change(screen.getByLabelText('X'), { target: { value: '@jack' } });
    fireEvent.change(screen.getByLabelText('LinkedIn'), { target: { value: 'https://www.linkedin.com/in/jane-doe/?trk=x' } });
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    const saved = await screen.findByText('Public profile saved.');
    expect(saved).toHaveAttribute('role', 'status');
    expect(saved).not.toHaveClass('profile-save-error');
    expect(saved).toBe(screen.getByRole('button', { name: 'Save profile' }).nextElementSibling);
    expect((await sources.tracker.getAccount()).publicProfile).toMatchObject({ github: 'octocat', x: 'jack', linkedin: 'jane-doe' });
    expect(screen.getByLabelText('GitHub')).toHaveValue('octocat');
    expect(screen.getByLabelText('X')).toHaveValue('jack');
    expect(screen.getByLabelText('LinkedIn')).toHaveValue('jane-doe');
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
