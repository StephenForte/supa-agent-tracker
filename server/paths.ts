import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root. Source lives in server/ and the compile output in dist-server/, both one level down. */
export const repoRoot = path.resolve(here, '..');

export const spaRoot = path.join(repoRoot, 'dist');

export const migrationsDir = path.join(repoRoot, 'server', 'db', 'migrations');
