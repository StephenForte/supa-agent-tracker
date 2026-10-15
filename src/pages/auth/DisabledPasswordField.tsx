import { useId } from 'react';

/** Disabled, unnamed, and uncontrolled. The value is never read into React state. */
export function DisabledPasswordField({ label }: { label: string }) {
  const id = useId();
  const hintId = useId();
  return <div className="mt-3 flex max-w-md flex-col gap-1">
    <label htmlFor={id}>{label}</label>
    <input id={id} type="password" disabled autoComplete="off" aria-describedby={hintId} className="w-full rounded border border-slate-400 bg-slate-100 px-2 py-2" />
    <p id={hintId} className="text-sm text-slate-600">Disabled in demo</p>
  </div>;
}
