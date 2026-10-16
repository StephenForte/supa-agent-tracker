import { useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';

export function TokenReveal({ plaintext, onDismiss, demo = true }: { plaintext: string; onDismiss: () => void; demo?: boolean }) {
  const field = useRef<HTMLInputElement>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
      setCopyError(null);
    } catch {
      field.current?.focus();
      field.current?.select();
      setCopied(false);
      setCopyError('Clipboard copy failed. The token is selected so you can copy it manually.');
    }
  }
  return <section aria-label="One-time token reveal" className="slot border-amber-700 bg-amber-50">
    <p className="rounded border border-amber-800 bg-amber-100 px-3 py-2 font-semibold text-amber-950">{demo ? 'Fake demo token — cannot authenticate anything' : 'Copy this token now. It will not be shown again.'}</p>
    <label htmlFor="demo-token-plaintext" className="mt-3 block text-sm">{demo ? 'Fake demo token' : 'Access token'}</label>
    <input id="demo-token-plaintext" ref={field} readOnly value={plaintext} autoComplete="off" spellCheck={false} className="mt-1 w-full max-w-full break-all rounded border border-slate-400 bg-white px-2 py-2 font-mono text-sm" />
    <div className="mt-3 flex flex-wrap gap-2">
      <Button variant="primary" onClick={() => void copy()}>Copy</Button>
      <Button onClick={onDismiss}>Dismiss</Button>
    </div>
    {copied && <p role="status">Copied.</p>}
    {copyError && <p role="alert">{copyError}</p>}
  </section>;
}
