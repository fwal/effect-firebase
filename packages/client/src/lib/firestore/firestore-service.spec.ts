import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Cause, Data, Effect, Exit, Result } from 'effect';
import { FirestoreService } from 'effect-firebase';
import type { Firestore } from 'firebase/firestore';

class TestError extends Data.TaggedError('TestError')<{ reason: string }> {}

type Op = readonly [name: string, ...args: unknown[]];

const h = vi.hoisted(() => {
  const state = {
    directOps: [] as Op[],
    txOps: [] as Op[],
    batchOps: [] as Op[],
    runTransactionCalls: 0,
    batchesCreated: 0,
    commits: 0,
  };

  const reset = () => {
    state.directOps = [];
    state.txOps = [];
    state.batchOps = [];
    state.runTransactionCalls = 0;
    state.batchesCreated = 0;
    state.commits = 0;
  };

  const idOf = (path: string) => path.split('/').pop() as string;

  const fakeSnapshot = (path: string, data: Record<string, unknown>) => ({
    id: idOf(path),
    ref: { id: idOf(path), path },
    data: () => data,
  });

  const fakeDocRef = (path: string): Record<string, unknown> => {
    const ref: Record<string, unknown> = {
      id: idOf(path),
      path,
      type: 'document',
      withConverter: () => ref,
    };
    return ref;
  };

  const fakeCollection = (path: string): Record<string, unknown> => {
    const col: Record<string, unknown> = {
      path,
      type: 'collection',
      withConverter: () => col,
    };
    return col;
  };

  const tx = {
    get: async (ref: { path: string }) => {
      state.txOps.push(['get', ref.path]);
      return fakeSnapshot(ref.path, { title: 'tx' });
    },
    set: (ref: { path: string }, data: unknown, options?: unknown) => {
      state.txOps.push(['set', ref.path, data, options]);
    },
    update: (ref: { path: string }, data: unknown) => {
      state.txOps.push(['update', ref.path, data]);
    },
    delete: (ref: { path: string }) => {
      state.txOps.push(['delete', ref.path]);
    },
  };

  const makeBatch = () => {
    state.batchesCreated += 1;
    return {
      set: (ref: { path: string }, data: unknown, options?: unknown) => {
        state.batchOps.push(['set', ref.path, data, options]);
      },
      update: (ref: { path: string }, data: unknown) => {
        state.batchOps.push(['update', ref.path, data]);
      },
      delete: (ref: { path: string }) => {
        state.batchOps.push(['delete', ref.path]);
      },
      commit: async () => {
        state.commits += 1;
      },
    };
  };

  return {
    state,
    reset,
    fakeSnapshot,
    fakeDocRef,
    fakeCollection,
    tx,
    makeBatch,
  };
});

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: (dbOrCollection: { path?: string }, path?: string) =>
      path !== undefined
        ? h.fakeDocRef(path)
        : h.fakeDocRef(`${dbOrCollection.path}/generated-id`),
    collection: (_db: unknown, path: string) => h.fakeCollection(path),
    query: (ref: unknown) => ref,
    getDoc: async (ref: { path: string }) => {
      h.state.directOps.push(['get', ref.path]);
      return h.fakeSnapshot(ref.path, { title: 'direct' });
    },
    getDocs: async (q: { path: string }) => {
      h.state.directOps.push(['query', q.path]);
      return { docs: [h.fakeSnapshot(`${q.path}/1`, { title: 'direct' })] };
    },
    addDoc: async (col: { path: string }, data: unknown) => {
      h.state.directOps.push(['add', col.path, data]);
      return h.fakeDocRef(`${col.path}/added-id`);
    },
    setDoc: async (ref: { path: string }, data: unknown, options?: unknown) => {
      h.state.directOps.push(['set', ref.path, data, options]);
    },
    updateDoc: async (ref: { path: string }, data: unknown) => {
      h.state.directOps.push(['update', ref.path, data]);
    },
    deleteDoc: async (ref: { path: string }) => {
      h.state.directOps.push(['delete', ref.path]);
    },
    runTransaction: async <T>(
      _db: unknown,
      fn: (tx: unknown) => Promise<T>
    ) => {
      h.state.runTransactionCalls += 1;
      return fn(h.tx);
    },
    writeBatch: () => h.makeBatch(),
  };
});

// Imported after the mock so the service uses the mocked SDK functions.
import { layerFromFirestore } from './firestore-service.js';

const db = {} as Firestore;

const run = <A, E>(effect: Effect.Effect<A, E, FirestoreService>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layerFromFirestore(db))));

const runExit = <A, E>(effect: Effect.Effect<A, E, FirestoreService>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(layerFromFirestore(db))));

const withService = <A, E>(
  f: (service: FirestoreService['Service']) => Effect.Effect<A, E>
) => Effect.flatMap(FirestoreService, f);

beforeEach(() => {
  h.reset();
});

describe('FirestoreService (client)', () => {
  describe('withTransaction', () => {
    it('routes reads and writes through the transaction', async () => {
      await run(
        withService((fs) =>
          fs.withTransaction(
            Effect.gen(function* () {
              yield* fs.get('posts/1');
              yield* fs.set('posts/1', { title: 'a' });
              yield* fs.update('posts/2', { title: 'b' });
              yield* fs.delete('posts/3');
            })
          )
        )
      );

      expect(h.state.runTransactionCalls).toBe(1);
      expect(h.state.txOps.map((op) => op[0])).toEqual([
        'get',
        'set',
        'update',
        'delete',
      ]);
      expect(h.state.directOps).toEqual([]);
    });

    it('routes add through transaction.set with a pre-allocated ref', async () => {
      const result = await run(
        withService((fs) => fs.withTransaction(fs.add('posts', { title: 'a' })))
      );

      expect(result).toEqual({
        id: 'generated-id',
        path: 'posts/generated-id',
      });
      expect(h.state.txOps).toEqual([
        ['set', 'posts/generated-id', { title: 'a' }, undefined],
      ]);
    });

    it('propagates typed failures from the effect', async () => {
      const exit = await runExit(
        withService((fs) =>
          fs.withTransaction(
            Effect.gen(function* () {
              yield* fs.set('posts/1', { title: 'a' });
              yield* new TestError({ reason: 'boom' });
            })
          )
        )
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasFails(exit.cause)).toBe(true);
        const failure = Cause.findFail(exit.cause);
        expect(Result.getOrThrow(failure).error).toMatchObject({
          _tag: 'TestError',
          reason: 'boom',
        });
      }
    });

    it('joins the ambient transaction when nested', async () => {
      await run(
        withService((fs) =>
          fs.withTransaction(
            Effect.gen(function* () {
              yield* fs.set('posts/1', { title: 'a' });
              yield* fs.withTransaction(fs.set('posts/2', { title: 'b' }));
            })
          )
        )
      );

      expect(h.state.runTransactionCalls).toBe(1);
      expect(h.state.txOps.map((op) => op[1])).toEqual(['posts/1', 'posts/2']);
    });

    it('dies when querying inside a transaction', async () => {
      const exit = await runExit(
        withService((fs) => fs.withTransaction(fs.query('posts', [])))
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasDies(exit.cause)).toBe(true);
      }
    });
  });

  describe('withBatch', () => {
    it('stages writes on the batch and commits once', async () => {
      await run(
        withService((fs) =>
          fs.withBatch(
            Effect.gen(function* () {
              yield* fs.set('posts/1', { title: 'a' });
              yield* fs.update('posts/2', { title: 'b' });
              yield* fs.delete('posts/3');
              yield* fs.add('posts', { title: 'c' });
            })
          )
        )
      );

      expect(h.state.batchesCreated).toBe(1);
      expect(h.state.commits).toBe(1);
      expect(h.state.batchOps.map((op) => op[0])).toEqual([
        'set',
        'update',
        'delete',
        'set',
      ]);
      expect(h.state.directOps).toEqual([]);
    });

    it('reads bypass the batch and hit the database directly', async () => {
      await run(
        withService((fs) =>
          fs.withBatch(
            Effect.gen(function* () {
              yield* fs.get('posts/1');
              yield* fs.query('posts', []);
            })
          )
        )
      );

      expect(h.state.directOps.map((op) => op[0])).toEqual(['get', 'query']);
      expect(h.state.batchOps).toEqual([]);
    });

    it('does not commit when the effect fails', async () => {
      const exit = await runExit(
        withService((fs) =>
          fs.withBatch(
            Effect.gen(function* () {
              yield* fs.set('posts/1', { title: 'a' });
              yield* new TestError({ reason: 'boom' });
            })
          )
        )
      );

      expect(Exit.isFailure(exit)).toBe(true);
      expect(h.state.commits).toBe(0);
    });

    it('routes writes to the transaction when used inside withTransaction', async () => {
      await run(
        withService((fs) =>
          fs.withTransaction(fs.withBatch(fs.set('posts/1', { title: 'a' })))
        )
      );

      expect(h.state.batchesCreated).toBe(0);
      expect(h.state.txOps.map((op) => op[0])).toEqual(['set']);
    });
  });

  describe('outside a transaction or batch', () => {
    it('reads and writes go directly to the database', async () => {
      await run(
        withService((fs) =>
          Effect.gen(function* () {
            yield* fs.get('posts/1');
            yield* fs.set('posts/1', { title: 'a' });
            yield* fs.delete('posts/2');
          })
        )
      );

      expect(h.state.directOps.map((op) => op[0])).toEqual([
        'get',
        'set',
        'delete',
      ]);
      expect(h.state.txOps).toEqual([]);
      expect(h.state.batchOps).toEqual([]);
    });
  });
});
