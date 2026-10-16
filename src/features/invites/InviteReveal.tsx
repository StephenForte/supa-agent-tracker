import { useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
/** Mirrors TokenReveal: plaintext lives only in the mounted reveal, never storage or a query. */
export function InviteReveal({ link, onDismiss }: { link: string; onDismiss: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(link); setMessage('Copied.'); }
    catch { field.current?.focus(); field.current?.select(); setMessage('Clipboard copy failed. The link is selected so you can copy it manually.'); }
  }
  return <section aria-label="One-time invite reveal" className="slot border-amber-700 bg-amber-50">
    <p>Copy this invite link now. It will not be shown again.</p>
    <label>Invite link<input ref={field} readOnly value={link} autoComplete="off" spellCheck={false} className="mt-1 block w-full rounded border border-slate-400 bg-white px-3 py-2 font-mono text-sm" /></label>
    <div className="link-list"><Button onClick={() => void copy()}>Copy</Button><Button onClick={onDismiss}>Dismiss</Button></div>
    {message && <p role="status">{message}</p>}
  </section>;
}
