import { describe, expect, it } from 'vitest';
import { createClock } from '../../domain/clock';
import { elapsed, projectCounts } from '../../domain/derive';
import { createDemoSources } from './createDemoSources';
import { STORAGE_KEY, type StorageAdapter } from './persistence';
import { seedTracker } from './seed';
const initialNow = Date.parse('2026-10-14T20:00:00Z');
const day = 24 * 60 * 60_000;
function storageAdapter(): StorageAdapter {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}
async function expectScenarios(sources: ReturnType<typeof createDemoSources>, now: number) {
  const { tracker } = sources;
  const [projects, runs, agents] = await Promise.all([tracker.listProjects(), tracker.listRuns(), tracker.listAgents()]);
  for (const [id, liveRunning, staleRunning] of [['prj_offers', 3, 0], ['prj_dashboard', 0, 1]] as const) {
    const project = projects.find(item => item.id === id)!;
    expect(projectCounts(project, runs, agents, now)).toMatchObject({ liveRunning, staleRunning });
    expect(await tracker.listRuns(id)).toEqual(runs.filter(run => run.projectId === id));
  }
  for (const run of runs) expect(await tracker.getRun(run.id)).toEqual(run);
  return runs;
}
describe('simulated demo heartbeats', () => {
  it('preserves live/stale scenarios through long sessions and persisted reloads without changing elapsed origins or ended runs', async () => {
    const storage = storageAdapter(), clock = createClock(initialNow);
    const sources = createDemoSources({ clock, storage });
    try {
      const before = await expectScenarios(sources, clock.now());
      const stale = before.find(run => run.id === 'run_4');
      const ended = before.filter(run => run.executionState !== 'running');
      const initialElapsed = elapsed(before.find(run => run.id === 'run_1')!, clock.now());
      let notifications = 0;
      const unsubscribe = sources.tracker.subscribe(() => { notifications++; });
      for (const advance of [16 * 60_000, 8 * day]) {
        clock.advance(advance);
        const persistedBeforeReads = JSON.parse(storage.getItem(STORAGE_KEY)!);
        expect(persistedBeforeReads.tracker.runs.find((run: { id: string }) => run.id === 'run_1').lastContactAt).toBe(new Date(clock.now()).toISOString());
        const runs = await expectScenarios(sources, clock.now());
        expect(runs.find(run => run.id === 'run_4')).toEqual(stale);
        expect(runs.filter(run => run.executionState !== 'running')).toEqual(ended);
        for (const id of ['run_1', 'run_2', 'run_10']) {
          const original = before.find(run => run.id === id)!, current = runs.find(run => run.id === id)!;
          expect(current).toEqual({ ...original, lastContactAt: new Date(clock.now()).toISOString() });
        }
        expect(elapsed(runs.find(run => run.id === 'run_1')!, clock.now())).toBe(initialElapsed + clock.now() - initialNow);
        const persisted = JSON.parse(storage.getItem(STORAGE_KEY)!);
        expect(persisted.tracker.runs).toEqual(runs);
        expect(persisted.tracker.demoLiveRunIds).toEqual(['run_1', 'run_2', 'run_10']);
      }
      expect(notifications).toBe(2);
      unsubscribe();
      sources.dispose(); // Closing the tab stops this store's heartbeat.
      const reloadedClock = createClock(clock.now() + day);
      const reloaded = createDemoSources({ clock: reloadedClock, storage });
      try {
        const runs = await expectScenarios(reloaded, reloadedClock.now());
        expect(runs.find(run => run.id === 'run_4')).toEqual(stale);
        expect(runs.filter(run => run.executionState !== 'running')).toEqual(ended);
        expect(runs.find(run => run.id === 'run_1')?.startedAt).toBe(before.find(run => run.id === 'run_1')?.startedAt);
        expect(elapsed(runs.find(run => run.id === 'run_1')!, reloadedClock.now())).toBe(initialElapsed + reloadedClock.now() - initialNow);
        expect(JSON.parse(storage.getItem(STORAGE_KEY)!).tracker.runs).toEqual(runs);
      } finally { reloaded.dispose(); }
    } finally { sources.dispose(); }
  });
  it('upgrades old persisted demos without losing edits and reconciles contacts before any read', async () => {
    const storage = storageAdapter();
    const legacy = seedTracker(initialNow);
    const { demoLiveRunIds: _oldMarker, ...oldState } = legacy;
    void _oldMarker;
    oldState.projects[0]!.name = 'Preserved edit';
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tracker: oldState, privateNotes: [] }));
    const clock = createClock(initialNow + day);
    const sources = createDemoSources({ clock, storage });
    try {
      expect((await sources.tracker.getRun('run_2'))?.lastContactAt).toBe(new Date(clock.now()).toISOString());
      await expectScenarios(sources, clock.now());
      expect((await sources.tracker.getProject('prj_offers'))?.name).toBe('Preserved edit');
    } finally { sources.dispose(); }
  });
  it('keeps reads side-effect free and consistent with metadata mutation results', async () => {
    const storage = storageAdapter(), clock = createClock(initialNow);
    const sources = createDemoSources({ clock, storage });
    try {
      clock.advance(16 * 60_000);
      const revision = sources.tracker.getSnapshot();
      const persisted = storage.getItem(STORAGE_KEY);
      const run = (await sources.tracker.getRun('run_1'))!;
      expect(await sources.tracker.listRuns('prj_offers')).toContainEqual(run);
      expect(await sources.tracker.listRuns()).toContainEqual(run);
      expect(sources.tracker.getSnapshot()).toBe(revision);
      expect(storage.getItem(STORAGE_KEY)).toBe(persisted);
      const corrected = await sources.tracker.updateRunMetadata(run.id, { title: 'Corrected' }, run.revision);
      expect(corrected.status).toBe('saved');
      if (corrected.status === 'saved') {
        expect(await sources.tracker.getRun(run.id)).toEqual(corrected.value);
        expect(await sources.tracker.updateRunMetadata(run.id, { title: 'Stale edit' }, run.revision)).toEqual({ status: 'conflict', current: corrected.value });
      }
      const closed = await sources.tracker.closeRun(run.id, 'failed', 'Demo recovery');
      if (closed.status !== 'saved') throw new Error('Expected manual close to succeed');
      expect(await sources.tracker.getRun(run.id)).toEqual(closed.value);
      expect(await sources.tracker.listRuns()).toContainEqual(closed.value);
    } finally { sources.dispose(); }
  });
  it('never heartbeats closed live fixtures and reset restores the seed and heartbeat participants', async () => {
    const storage = storageAdapter(), clock = createClock(initialNow);
    const sources = createDemoSources({ clock, storage });
    try {
      await sources.tracker.closeRun('run_1', 'cancelled', 'Stop this demo execution');
      const closed = await sources.tracker.getRun('run_1');
      clock.advance(day);
      expect(await sources.tracker.getRun('run_1')).toEqual(closed);
      const reload = createDemoSources({ clock: createClock(clock.now() + day), storage });
      try { expect(await reload.tracker.getRun('run_1')).toEqual(closed); } finally { reload.dispose(); }
      await sources.tracker.resetDemo();
      expect(storage.getItem(STORAGE_KEY)).toBeNull();
      expect(await sources.tracker.listRuns()).toEqual(seedTracker(clock.now()).runs);
      await expectScenarios(sources, clock.now());
      clock.advance(16 * 60_000);
      await expectScenarios(sources, clock.now());
    } finally { sources.dispose(); }
  });
});
