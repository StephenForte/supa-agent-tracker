import { MobileFilters } from '../../components/ui/MobileFilters';
import { defaultFilters } from '../../domain/projects/dashboard';
import { Button } from '../../components/ui/Button';
import { lifecycleLabels, projectTypeLabels } from '../../domain/format';
import { describeFilters, projectActivityLabels, type ProjectFilters as Filters, type ProjectSort } from '../../domain/projects/dashboard';
const control = 'mt-1 w-full min-w-0 rounded border border-slate-400 bg-white p-2 text-sm';
export function ProjectFilters({ filters, onChange, onClear, sort, onSort, tags, harnesses }: { filters: Filters; onChange: (filters: Filters) => void; onClear: () => void; sort: ProjectSort; onSort: (sort: ProjectSort) => void; tags: string[]; harnesses: string[] }) {
  const select = (key: keyof Filters, label: string, options: [string, string][]) => <label className="min-w-0 text-sm font-medium">{label}<select className={control} value={filters[key]} onChange={event => onChange({ ...filters, [key]: event.target.value })}>{options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>;
  const count = Object.entries(filters).filter(([key, value]) => value !== defaultFilters[key as keyof Filters]).length + Number(sort !== 'active');
  return <MobileFilters count={count}><section aria-label="Project filters" className="mb-6 rounded-xl border border-slate-300 bg-white p-4">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="min-w-0 text-sm font-medium">Search projects<input type="search" className={control} value={filters.text} placeholder="Name, description, tag or repo" onChange={event => onChange({ ...filters, text: event.target.value })} /></label>
      {select('lifecycle', 'Lifecycle', [['unarchived', 'Archived hidden'], ['', 'All lifecycles'], ...Object.entries(lifecycleLabels)])}
      {select('type', 'Project type', [['', 'All types'], ...Object.entries(projectTypeLabels)])}
      {select('activity', 'Activity', [['', 'All activity'], ...Object.entries(projectActivityLabels)])}
      {select('harness', 'Harness', [['', 'All harnesses'], ...harnesses.map(value => [value, value] as [string, string])])}
      {select('tag', 'Tag', [['', 'All tags'], ...tags.map(value => [value, value] as [string, string])])}
      <label className="min-w-0 text-sm font-medium">Sort projects<select className={control} value={sort} onChange={event => onSort(event.target.value as ProjectSort)}><option value="active">Active first</option><option value="latest">Latest activity</option><option value="name">Name</option><option value="created">Created date (newest)</option></select></label>
      <div className="flex items-end"><Button onClick={onClear}>Clear filters</Button></div>
    </div>
    <p className="mb-0 text-xs text-slate-600" aria-live="polite">Active filters: {describeFilters(filters).join(' · ')}. These filters may hide live work.</p>
  </section></MobileFilters>;
}
