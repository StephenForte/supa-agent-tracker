import type { ReactNode } from 'react';
export interface DisclosureProps { title: ReactNode; children: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }
export function Disclosure({ title, children, open, onOpenChange }: DisclosureProps) {
  return <details open={open} onToggle={event => onOpenChange?.(event.currentTarget.open)}><summary>{title}</summary><div className="disclosure-body">{children}</div></details>;
}
