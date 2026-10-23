import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '../../data/hooks';
import { createDemoSources } from '../../data/mock/createDemoSources';
import { seedTracker } from '../../data/mock/seed';
import { CloseRunDialog } from '../runs/CloseRunDialog';
import { ScopeFields } from './ScopeFields';
import { LiveTokensPanel } from './LiveTokensPanel';
import { TokensPanel } from './TokensPanel';

const projects = Array.from({ length: 30 }, (_, index) => ({ ...seedTracker(Date.now()).projects[0]!, id: `project-${index}`, name: `Project ${String(index + 1).padStart(2, '0')}` }));
HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
HTMLDialogElement.prototype.close ??= function () { this.open = false; };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Harness({ count = 30 }: { count?: number }) {
  const [ids, setIds] = useState<string[]>([]);
  return <ScopeFields mode="specific" projectIds={ids} projects={projects.slice(0, count)} onMode={() => {}} onProjectIds={setIds} />;
}

describe('project scope selection', () => {
  it('filters without losing selections, adds only visible rows, preserves order, and clears every selection', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const names = () => screen.getAllByRole('checkbox').map(input => input.closest('label')?.textContent);
    const original = names();
    await user.click(screen.getByRole('checkbox', { name: 'Project 30' }));
    expect(names()).toEqual(original);
    await user.type(screen.getByRole('searchbox', { name: 'Filter projects' }), 'pROJECT 01');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('1 of 30 selected');
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByRole('status')).toHaveTextContent('2 of 30 selected');
    await user.clear(screen.getByRole('searchbox'));
    expect(screen.getByRole('checkbox', { name: 'Project 30' })).toBeChecked();
    expect(names()).toEqual(original);
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByRole('status')).toHaveTextContent('30 of 30 selected');
    await user.type(screen.getByRole('searchbox'), 'no match');
    expect(screen.getByText('No matching projects.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('status')).toHaveTextContent('0 of 30 selected');
    await user.clear(screen.getByRole('searchbox'));
    expect(screen.getAllByRole('checkbox').every(input => !(input as HTMLInputElement).checked)).toBe(true);
  });

  it('offers the filter only above eight projects', () => {
    const view = render(<Harness count={8} />);
    expect(screen.queryByRole('searchbox')).toBeNull();
    view.rerender(<Harness count={9} />);
    expect(screen.getByRole('searchbox')).toBeVisible();
  });
});

for (const live of [false, true]) {
  describe(`${live ? 'live' : 'demo'} token layout`, () => {
    function setup() {
      const sources = createDemoSources();
      vi.spyOn(sources.tracker, 'listProjects').mockResolvedValue(projects);
      const create = vi.spyOn(sources.tracker, 'createToken').mockResolvedValue({ status: 'invalid', message: 'Scope rejected' });
      const update = vi.spyOn(sources.tracker, 'updateTokenScope').mockResolvedValue({ status: 'invalid', message: 'Scope rejected' });
      render(<DataProvider sources={sources}>{live ? <LiveTokensPanel /> : <TokensPanel />}</DataProvider>);
      return { sources, create, update };
    }

    for (const edit of [false, true]) {
      it(`${edit ? 'saves' : 'creates'} the full hidden selection and keeps title, error and actions outside the list`, async () => {
        const user = userEvent.setup();
        const { sources, create, update } = setup();
        try {
          await screen.findByRole('article', { name: 'Demo coding client tok_1' });
          if (edit) await user.click(within(screen.getByRole('article', { name: 'Demo coding client tok_1' })).getByRole('button', { name: 'Edit scope' }));
          else await user.click(screen.getByRole('button', { name: 'Create token' }));
          const dialog = screen.getByRole('dialog');
          const ui = within(dialog);
          await user.click(ui.getByRole('radio', { name: 'Specific projects' }));
          await user.click(ui.getByRole('button', { name: 'Clear' }));
          await user.click(ui.getByRole('checkbox', { name: 'Project 30' }));
          await user.type(ui.getByRole('searchbox'), 'Project 01');
          await user.click(ui.getByRole('button', { name: 'Select all' }));
          if (!edit) await user.type(ui.getByRole('textbox', { name: 'Label' }), 'Client');
          const action = ui.getByRole('button', { name: edit ? 'Save scope' : 'Create token' });
          await user.click(action);
          const scope = { allProjects: false, projectIds: ['project-29', 'project-0'] };
          if (edit) expect(update).toHaveBeenLastCalledWith('tok_1', scope);
          else expect(create).toHaveBeenLastCalledWith({ label: 'Client', ...scope });
          const list = ui.getByRole('group', { name: 'Projects' });
          const error = await ui.findByRole('alert');
          for (const element of [action, ui.getByRole('button', { name: 'Close' }), ui.getByRole('heading', { level: 2 }), error]) expect(list).not.toContainElement(element);
          expect(action.parentElement).toHaveClass('dialog-footer');
          expect(error.parentElement).toBe(action.parentElement);
          expect(dialog).toHaveClass('dialog-with-footer');
          await user.click(ui.getByRole('button', { name: 'Clear' }));
          await user.click(action);
          if (edit) expect(update).toHaveBeenLastCalledWith('tok_1', { allProjects: false, projectIds: [] });
          else expect(create).toHaveBeenLastCalledWith({ label: 'Client', allProjects: false, projectIds: [] });
        } finally { sources.dispose(); }
      });
    }
  });
}

it('preserves the existing CloseRunDialog DOM without footer opt-in', () => {
  const sources = createDemoSources();
  const state = seedTracker(Date.now());
  try {
    render(<DataProvider sources={sources}><CloseRunDialog run={state.runs[0]!} onClose={() => {}} /></DataProvider>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toBe('');
    expect(Array.from(dialog.children).map(element => element.tagName)).toEqual(['H2', 'P', 'FORM', 'BUTTON']);
    expect(dialog.lastElementChild).toHaveTextContent('Close');
    expect(dialog.querySelector('.dialog-body, .dialog-footer')).toBeNull();
  } finally { sources.dispose(); }
});
