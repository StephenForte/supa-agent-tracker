import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';
export interface DialogProps { open: boolean; title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }
/** Native modal supplies focus trapping, inert background and Escape behavior; restore trigger on cleanup. */
export function Dialog({ open, title, children, onClose, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (trigger instanceof HTMLElement) trigger.focus(); };
  }, [open]);
  return <dialog ref={ref} className={footer === undefined ? undefined : 'dialog-with-footer'} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>
    <h2 id={titleId}>{title}</h2>{footer === undefined ? <>{children}<Button onClick={onClose}>Close</Button></> : <>
      <div className="dialog-body">{children}</div>
      <div className="dialog-footer">{footer}<Button onClick={onClose}>Close</Button></div>
    </>}
  </dialog>;
}
