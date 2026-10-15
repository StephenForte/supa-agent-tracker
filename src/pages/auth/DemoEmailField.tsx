import { useId } from 'react';

/** Accepts typing locally in the DOM. The value is not read, stored, or submitted. */
export function DemoEmailField({ label }: { label: string }) {
  const id = useId();
  return <div className="mt-3 flex max-w-md flex-col gap-1">
    <label htmlFor={id}>{label}</label>
    <input id={id} type="email" autoComplete="off" className="w-full rounded border border-slate-400 px-2 py-2" />
  </div>;
}
