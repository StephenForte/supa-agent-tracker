import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';
export interface DialogProps { open: boolean; title: string; children: ReactNode; onClose: () => void }
/** Native modal supplies focus trapping, inert background and Escape behavior; restore trigger on cleanup. */
export function Dialog({ open, title, children, onClose }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (trigger instanceof HTMLElement) trigger.focus(); };
  }, [open]);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>
    <h2 id={titleId}>{title}</h2>{children}<Button onClick={onClose}>Close</Button>
  </dialog>;
}
