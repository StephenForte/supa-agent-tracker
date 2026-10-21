import { useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { BAD_TOKEN_HELP, claudeCodeConfigSnippet, claudeDesktopConfigSnippet, codexConfigSnippet, cursorConfigSnippet, grokBotConfigSnippet, museSetupMessage } from '../../domain/integrations/clientConfig';

const MUSE_TOKEN_LINE = 'Paste the token only into Muse\'s masked "API Key" field, using the Copy button at the top of this reveal.';

const snippetsFor = (mcpUrl: string, plaintext: string): readonly { name: string; copy: string; text: string; rows: number; note?: string }[] => [
  { name: 'Cursor config', copy: 'Copy Cursor config', text: cursorConfigSnippet(mcpUrl, plaintext), rows: 8 },
  { name: 'Claude Desktop config', copy: 'Copy Claude Desktop config', text: claudeDesktopConfigSnippet(mcpUrl, plaintext), rows: 4 },
  { name: 'Grok Bot config', copy: 'Copy Grok Bot config', text: grokBotConfigSnippet(mcpUrl, plaintext), rows: 4 },
  { name: 'Muse setup message', copy: 'Copy Muse setup message', text: museSetupMessage(mcpUrl), rows: 4, note: MUSE_TOKEN_LINE },
  { name: 'Codex config', copy: 'Copy Codex config', text: codexConfigSnippet(mcpUrl, plaintext), rows: 12 },
  { name: 'Claude Code command', copy: 'Copy Claude Code command', text: claudeCodeConfigSnippet(mcpUrl, plaintext), rows: 3 },
];

/** Plaintext and client snippets exist only while this reveal is mounted. */
export function TokenReveal({ plaintext, mcpUrl, onDismiss, demo = true }: { plaintext: string; mcpUrl: string; onDismiss: () => void; demo?: boolean }) {
  const field = useRef<HTMLInputElement>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setCopyError(null);
    } catch {
      field.current?.focus();
      field.current?.select();
      setCopied(null);
      setCopyError('Clipboard copy failed. The token is selected so you can copy it manually.');
    }
  }
  return <section aria-label="One-time token reveal" className="slot border-amber-700 bg-amber-50">
    <p className="rounded border border-amber-800 bg-amber-100 px-3 py-2 font-semibold text-amber-950">{demo ? 'Fake demo token — cannot authenticate anything' : 'Copy this token now. It will not be shown again.'}</p>
    <label htmlFor="demo-token-plaintext" className="mt-3 block text-sm">{demo ? 'Fake demo token' : 'Access token'}</label>
    <input id="demo-token-plaintext" ref={field} readOnly value={plaintext} autoComplete="off" spellCheck={false} className="mt-1 w-full max-w-full break-all rounded border border-slate-400 bg-white px-2 py-2 font-mono text-sm" />
    <div className="mt-3 flex flex-wrap gap-2">
      <Button variant="primary" onClick={() => void copy(plaintext, 'Copied.')}>{copied === 'Copied.' ? 'Copied' : 'Copy'}</Button>
      <Button onClick={onDismiss}>Dismiss</Button>
    </div>
    {snippetsFor(mcpUrl, plaintext).map(snippet => {
      const fieldId = `token-config-${snippet.name.replaceAll(' ', '-').toLowerCase()}`;
      return <div key={snippet.name} className="mt-3">
        <label htmlFor={fieldId} className="block text-sm">{snippet.name}</label>
        <textarea id={fieldId} readOnly value={snippet.text} autoComplete="off" spellCheck={false} rows={snippet.rows} className="mt-1 w-full max-w-full break-all rounded border border-slate-400 bg-white px-2 py-2 font-mono text-sm" />
        <Button onClick={() => void copy(snippet.text, `${snippet.name} copied.`)}>{copied === `${snippet.name} copied.` ? 'Copied' : snippet.copy}</Button>
        {snippet.note ? <p className="mt-2">{snippet.note}</p> : null}
      </div>;
    })}
    <p className="mt-3">{BAD_TOKEN_HELP}</p>
    {copied && <p role="status">{copied}</p>}
    {copyError && <p role="alert">{copyError}</p>}
  </section>;
}
