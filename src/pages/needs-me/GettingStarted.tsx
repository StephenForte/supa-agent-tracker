import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { gettingStartedState, projectPrompt } from '../../domain/integrations/agentContext';
import type { McpToken, Project } from '../../domain/types';

const links = {
  project: '/projects/new',
  token: '/settings/tokens',
  connect: '/settings/integrations',
} as const;

/** Live-mode setup shown only while the signed-in user has no runs. */
export function GettingStarted({ projects, tokens }: { projects: readonly Project[]; tokens: readonly McpToken[] }) {
  const { steps, doneCount, promptProject } = gettingStartedState(projects, tokens);
  const [status, setStatus] = useState('');
  async function copyPrompt() {
    if (!promptProject) return;
    try {
      await navigator.clipboard.writeText(projectPrompt(promptProject));
      setStatus(`Copied prompt for ${promptProject.name}.`);
    } catch {
      setStatus('Copy failed. Select the text and copy it manually.');
    }
  }
  const hint = projects.length === 0
    ? 'Create a project first.'
    : 'Create a project that is not archived first.';
  return <section aria-labelledby="get-started-heading" className="slot min-w-0">
    <h2 id="get-started-heading">Get started</h2>
    <p>{doneCount}/3</p>
    <ol className="mt-3 grid gap-3">
      {steps.map(step => <li key={step.id} data-step={step.id} data-done={step.done ? 'yes' : 'no'}>
        <p className="m-0 font-semibold">{step.done ? 'Done' : 'Not done'}</p>
        <Link to={links[step.id]}>{step.title}</Link>
        {step.id === 'connect' && <div className="mt-2">
          <Button className="max-w-full whitespace-normal text-left" disabled={!promptProject} aria-describedby={promptProject ? undefined : 'get-started-prompt-hint'} onClick={() => void copyPrompt()}>
            {promptProject ? `Copy prompt for ${promptProject.name}` : 'Copy prompt'}
          </Button>
          {!promptProject && <p id="get-started-prompt-hint">{hint}</p>}
        </div>}
      </li>)}
    </ol>
    {status && <p role="status">{status}</p>}
  </section>;
}
