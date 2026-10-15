export type InstructionSegment =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string };

function indexOfUrl(value: string, from: number): number {
  const http = value.indexOf('http://', from);
  const https = value.indexOf('https://', from);
  if (http === -1) return https;
  if (https === -1) return http;
  return Math.min(http, https);
}

function splitTrailingPunctuation(url: string): { href: string; rest: string } {
  let href = url;
  let rest = '';
  while (/[.,);:!?]$/.test(href)) {
    rest = href.slice(-1) + rest;
    href = href.slice(0, -1);
  }
  return { href, rest };
}

/** Plain text, backtick code, and http(s) links. Markup stays text so it is never parsed as HTML. */
export function instructionSegments(instruction: string): InstructionSegment[] {
  const parts: InstructionSegment[] = [];
  const pushText = (text: string) => {
    if (!text) return;
    const last = parts.at(-1);
    if (last?.kind === 'text') last.text += text;
    else parts.push({ kind: 'text', text });
  };
  let index = 0;
  while (index < instruction.length) {
    if (instruction.startsWith('`', index)) {
      const end = instruction.indexOf('`', index + 1);
      if (end === -1) {
        pushText(instruction.slice(index));
        break;
      }
      parts.push({ kind: 'code', text: instruction.slice(index + 1, end) });
      index = end + 1;
      continue;
    }
    if (instruction.startsWith('http://', index) || instruction.startsWith('https://', index)) {
      const match = /^https?:\/\/[^\s<>"']+/.exec(instruction.slice(index));
      if (match?.[0]) {
        const { href, rest } = splitTrailingPunctuation(match[0]);
        if (href.length > 'https://'.length) {
          parts.push({ kind: 'link', text: href, href });
          pushText(rest);
          index += match[0].length;
          continue;
        }
      }
    }
    const nextCode = instruction.indexOf('`', index);
    const nextUrl = indexOfUrl(instruction, index);
    let end = instruction.length;
    if (nextCode !== -1) end = Math.min(end, nextCode);
    if (nextUrl !== -1) end = Math.min(end, nextUrl);
    if (end === index) {
      pushText(instruction.slice(index, index + 1));
      index += 1;
      continue;
    }
    pushText(instruction.slice(index, end));
    index = end;
  }
  return parts.length > 0 ? parts : [{ kind: 'text', text: '' }];
}
