import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';
import { seedTracker } from '../../data/mock/seed';
import { ProjectCard } from './ProjectCard';

const now = Date.parse('2026-10-15T12:00:00Z');
const seed = seedTracker(now);
const project = seed.projects[0]!;

function show(isPublic: boolean) {
  return render(<MemoryRouter><ProjectCard project={{ ...project, isPublic }} runs={seed.runs} agents={seed.agents} now={now} /></MemoryRouter>);
}

it('shows a Public badge only on a public project', () => {
  const view = show(false);
  expect(screen.queryByText('Public')).toBeNull();
  view.rerender(<MemoryRouter><ProjectCard project={{ ...project, isPublic: true }} runs={seed.runs} agents={seed.agents} now={now} /></MemoryRouter>);
  expect(screen.getByText('Public')).toBeVisible();
});
