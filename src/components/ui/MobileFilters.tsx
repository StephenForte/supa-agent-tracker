import { useId, useState, type ReactNode } from 'react';
import { Button } from './Button';
export function MobileFilters({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="mobile-filters">
    <Button className="mobile-filter-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>Filters{count > 0 ? ` (${count})` : ''}</Button>
    <div id={id} className={open ? 'filter-content is-open' : 'filter-content'}>{children}</div>
  </div>;
}
