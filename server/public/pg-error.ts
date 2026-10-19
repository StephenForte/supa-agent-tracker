export function postgresCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    if ('code' in current && typeof (current as { code: unknown }).code === 'string') {
      const code = (current as { code: string }).code;
      if (/^\d{5}$/.test(code)) return code;
    }
    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return undefined;
}
