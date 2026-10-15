import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { useTrackerData } from '../../data/hooks';
import { formatTimestamp, lifecycleLabels, projectTypeLabels } from '../../domain/format';
import { draftInput, projectDraft, validateDraft, type ProjectDraft } from '../../domain/projects/form';
import type { Project } from '../../domain/types';

const control = 'mt-1 w-full min-w-0 rounded border border-slate-400 bg-white p-2 text-base';
export function ProjectForm({ project }: { project?: Project }) {
  const source = useTrackerData();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => projectDraft(project));
  // This revision belongs to the draft's base, not a later subscription refresh.
  const [revision, setRevision] = useState(project?.revision ?? 0);
  const [conflict, setConflict] = useState<Project | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof validateDraft>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const cancelTo = project ? `/projects/${project.id}` : '/projects';
  function change<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) { setDraft(current => ({ ...current, [key]: value })); }
  async function save(expectedRevision: number) {
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    setMessage('');
    if (Object.keys(nextErrors).length) { setMessage('Check the highlighted fields.'); return; }
    setSaving(true);
    try {
      const input = draftInput(draft);
      const result = project ? await source.updateProject(project.id, input, expectedRevision) : await source.createProject(input);
      if (result.status === 'saved') { void navigate(`/projects/${result.value.id}`); return; }
      if (result.status === 'conflict') { setConflict(result.current); setRevision(result.current.revision); }
      else if (result.status === 'invalid') setMessage(result.message);
      else setMessage('This project no longer exists. Your draft is still here.');
    } catch { setMessage('The project could not be saved. Your draft is still here. Try again.'); }
    finally { setSaving(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); if (!saving && !conflict) void save(revision); }
  const field = (key: keyof ProjectDraft, label: string, type = 'text') => <div className="min-w-0"><label className="block text-sm font-medium" htmlFor={key}>{label}</label><input id={key} className={control} type={type} step={type === 'number' ? 'any' : undefined} value={String(draft[key])} onChange={event => change(key, event.target.value)} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} />{errors[key] && <span id={`${key}-error`} className="mt-1 block text-status-failed">{errors[key]}</span>}</div>;
  return <form noValidate onSubmit={submit} className="max-w-3xl space-y-6 rounded-xl border border-slate-300 bg-white p-5">
    {message && <p role="alert" className="text-status-failed">{message}</p>}
    {conflict && <section role="alert" className="rounded-lg border border-status-stale bg-amber-50 p-4 [overflow-wrap:anywhere]"><h2>Project changed elsewhere</h2><p>Your draft is preserved below. Review the current saved values before applying your draft on revision {conflict.revision}. Applying replaces these fields with your draft.</p>
      <dl className="space-y-2 text-sm">{Object.entries(projectDraft(conflict)).map(([key, value]) => <div key={key}><dt className="font-semibold">{{ name: 'Name', description: 'Description', type: 'Project type', lifecycle: 'Lifecycle', repositoryName: 'Repository name', repositoryUrl: 'Repository URL', prdUrl: 'PRD URL', tags: 'Tags', staleThresholdMinutes: 'Stale threshold minutes', heartbeatExpected: 'Heartbeat expected', instructions: 'Reporting instructions' }[key]}</dt><dd className="whitespace-pre-wrap">{typeof value === 'boolean' ? value ? 'Yes' : 'No' : value || '—'}</dd></div>)}</dl>
      <p className="text-xs">Updated {formatTimestamp(conflict.updatedAt)}</p><Button disabled={saving} onClick={() => void save(conflict.revision)}>Apply my draft on revision {conflict.revision}</Button>
    </section>}
    <fieldset disabled={saving} className="min-w-0 space-y-5">
      <legend className="mb-4 font-semibold">Project details</legend>
      {field('name', 'Name (required)')}
      <label className="block text-sm font-medium" htmlFor="description">Description<textarea id="description" className={control} rows={3} value={draft.description} onChange={event => change('description', event.target.value)} /></label>
      <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-medium" htmlFor="type">Project type<select id="type" className={control} value={draft.type} onChange={event => change('type', event.target.value as ProjectDraft['type'])}>{Object.entries(projectTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm font-medium" htmlFor="lifecycle">Lifecycle<select id="lifecycle" className={control} value={draft.lifecycle} onChange={event => change('lifecycle', event.target.value as ProjectDraft['lifecycle'])}>{Object.entries(lifecycleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      {field('repositoryName', 'Repository name')}{field('repositoryUrl', 'Repository URL', 'url')}{field('prdUrl', 'PRD URL', 'url')}{field('tags', 'Tags (comma separated)')}
    </fieldset>
    <fieldset disabled={saving} className="min-w-0 space-y-5 border-t border-slate-200 pt-4"><legend className="font-semibold">Reporting preferences</legend>
      {field('staleThresholdMinutes', 'Stale threshold minutes (required)', 'number')}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.heartbeatExpected} onChange={event => change('heartbeatExpected', event.target.checked)} />Heartbeat expected</label>
      <label className="block text-sm font-medium" htmlFor="instructions">Reporting instructions<textarea id="instructions" className={control} rows={4} value={draft.instructions} onChange={event => change('instructions', event.target.value)} /></label>
    </fieldset>
    <div className="flex flex-wrap items-center gap-4"><Button type="submit" variant="primary" disabled={saving || !!conflict}>{saving ? 'Saving…' : project ? 'Save changes' : 'Create project'}</Button>{!saving && <Link to={cancelTo}>Cancel</Link>}</div>
  </form>;
}
