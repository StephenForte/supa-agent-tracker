import { z } from 'zod';
import { trackerSchema, notesSchema } from './schema';
import type { TrackerState } from './seed';
import type { PrivateNote } from '../../domain/privateNotes';
export const STORAGE_KEY = 'supa-agent-tracker:demo:v1';
export interface StorageAdapter { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export interface DemoEnvelope { version: 1; tracker: TrackerState; privateNotes: PrivateNote[] }
const schema = z.object({ version: z.literal(1), tracker: trackerSchema, privateNotes: notesSchema }).refine(value => value.privateNotes.every(note => value.tracker.projects.some(project => project.id === note.projectId)));
/** Persistence is a browser-only composition concern, never exposed on either source interface. */
export function createPersistence(storage?: StorageAdapter) {
  return {
    load(): DemoEnvelope | null {
      try { const raw = storage?.getItem(STORAGE_KEY); if (!raw) return null; const parsed = schema.safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : null; } catch { return null; }
    },
    save(value: DemoEnvelope) { try { storage?.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* Storage denied/full: keep the live in-memory demo. */ } },
    clear() { try { storage?.removeItem(STORAGE_KEY); } catch { /* Reset still succeeds in memory. */ } },
  };
}
