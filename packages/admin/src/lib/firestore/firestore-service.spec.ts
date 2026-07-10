import { describe, expect, it } from 'vitest';
import { Cause, Data, Effect, Exit, Result, Stream } from 'effect';
import { FirestoreService } from 'effect-firebase';
import type { Firestore } from 'firebase-admin/firestore';
import { layerFromFirestore } from './firestore-service.js';

class TestError extends Data.TaggedError('TestError')<{ reason: string }> {}

type Op = readonly [name: string, ...args: unknown[]];

const makeFakeDb = () => {
  const state = {
    directOps: [] as Op[],
    txOps: [] as Op[],
    batchOps: [] as Op[],
    runTransactionCalls: 0,
    batchesCreated: 0,
    commits: 0,
  };

  const idOf = (path: string) => path.split('/').pop() as string;

  const fakeSnapshot = (path: string, data: Record<string, unknown>) => ({
    exists: true,
    id: idOf(path),
    ref: { id: idOf(path), path },
    data: () => data,
  });

  const fakeDocRef = (path: string): Record<string, unknown> => {
    const ref: Record<string, unknown> = {
      id: idOf(path),
      path,
      withConverter: () => ref,
      get: async () => {
        state.directOps.push(['get', path]);
        return fakeSnapshot(path, { title: 'direct' });
      },
      set: async (...args: unknown[]) => {
        state.directOps.push(['set', path, ...args]);
      },
      update: async (...args: unknown[]) => {
        state.directOps.push(['update', path, ...args]);
      },
      delete: async () => {
        state.directOps.push(['delete', path]);
      },
    };
    return ref;
  };

  const fakeCollection = (path: string): Record<string, unknown> => {
    const collection: Record<string, unknown> = {
      path,
      withConverter: () => collection,
      doc: () => fakeDocRef(`${path}/generated-id`),
      add: async (data: unknown) => {
        state.directOps.push(['add', path, data]);
        return fakeDocRef(`${path}/added-id`);
      },
      get: async () => {
        state.directOps.push(['query', path]);
        return { docs: [fakeSnapshot(`${path}/1`, { title: 'direct' })] };
      },
    };
    return collection;
  };

  const tx = {
    get: async (refOrQuery: { path: string; doc?: unknown }) => {
      // Collection refs (queries) have a doc factory, document refs do not.
      if (typeof refOrQuery.doc === 'function') {
        state.txOps.push(['query', refOrQuery.path]);
        return {
          docs: [fakeSnapshot(`${refOrQuery.path}/1`, { title: 'tx' })],
        };
      }
      state.txOps.push(['get', refOrQuery.path]);
      return fakeSnapshot(refOrQuery.path, { title: 'tx' });
    },
    create: (ref: { path: string }, data: unknown) => {
      state.txOps.push(['create', ref.path, data]);
    },
    set: (ref: { path: string }, data: unknown, options: unknown) => {
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
      create: (ref: { path: string }, data: unknown) => {
        state.batchOps.push(['create', ref.path, data]);
      },
      set: (ref: { path: string }, data: unknown, options: unknown) => {
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

  const db = {
    doc: fakeDocRef,
    collection: fakeCollection,
    recursiveDelete: async (ref: { path: string }) => {
      state.directOps.push(['recursiveDelete', ref.path]);
    },
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      state.runTransactionCalls += 1;
      return fn(tx);
    },
    batch: makeBatch,
  };

  return { db: db as unknown as Firestore, state };
};

const run = <A, E>(
  db: Firestore,
  effect: Effect.Effect<A, E, FirestoreService>
) => Effect.runPromise(effect.pipe(Effect.provide(layerFromFirestore(db))));

const runExit = <A, E>(
  db: Firestore,
  effect: Effect.Effect<A, E, FirestoreService>
) => Effect.runPromiseExit(effect.pipe(Effect.provide(layerFromFirestore(db))));

const withService = <A, E>(
  f: (service: FirestoreService['Service']) => Effect.Effect<A, E>
) => Effect.flatMap(FirestoreService, f);

describe('FirestoreService (admin)', () => {
  describe('withTransaction', () => {
    it('routes reads and writes through the transaction', async () => {
      const { db, state } = makeFakeDb();
      await run(
        db,
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

      expect(state.runTransactionCalls).toBe(1);
      expect(state.txOps.map((op) => op[0])).toEqual([
        'get',
        'set',
        'update',
        'delete',
      ]);
      expect(state.directOps).toEqual([]);
    });

    it('routes add through transaction.create with a pre-allocated ref', async () => {
      const { db, state } = makeFakeDb();
      const result = await run(
        db,
        withService((fs) => fs.withTransaction(fs.add('posts', { title: 'a' })))
      );

      expect(result).toEqual({
        id: 'generated-id',
        path: 'posts/generated-id',
      });
      expect(state.txOps).toEqual([
        ['create', 'posts/generated-id', { title: 'a' }],
      ]);
    });

    it('routes queries through transaction.get', async () => {
      const { db, state } = makeFakeDb();
      const results = await run(
        db,
        withService((fs) => fs.withTransaction(fs.query('posts', [])))
      );

      expect(state.txOps).toEqual([['query', 'posts']]);
      expect(results).toHaveLength(1);
      expect(results[0][1]).toEqual({ title: 'tx' });
    });

    it('returns the result of the effect', async () => {
      const { db } = makeFakeDb();
      const result = await run(
        db,
        withService((fs) => fs.withTransaction(Effect.succeed(42)))
      );
      expect(result).toBe(42);
    });

    it('propagates typed failures from the effect', async () => {
      const { db, state } = makeFakeDb();
      const exit = await runExit(
        db,
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
      expect(state.runTransactionCalls).toBe(1);
    });

    it('joins the ambient transaction when nested', async () => {
      const { db, state } = makeFakeDb();
      await run(
        db,
        withService((fs) =>
          fs.withTransaction(
            Effect.gen(function* () {
              yield* fs.set('posts/1', { title: 'a' });
              yield* fs.withTransaction(fs.set('posts/2', { title: 'b' }));
            })
          )
        )
      );

      expect(state.runTransactionCalls).toBe(1);
      expect(state.txOps.map((op) => op[1])).toEqual(['posts/1', 'posts/2']);
    });

    it('dies when streaming inside a transaction', async () => {
      const { db } = makeFakeDb();
      const exit = await runExit(
        db,
        withService((fs) =>
          fs.withTransaction(Stream.runCollect(fs.streamDoc('posts/1')))
        )
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasDies(exit.cause)).toBe(true);
      }
    });

    it('dies when deleteRecursive is used inside a transaction', async () => {
      const { db } = makeFakeDb();
      const exit = await runExit(
        db,
        withService((fs) => fs.withTransaction(fs.deleteRecursive('posts/1')))
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasDies(exit.cause)).toBe(true);
      }
    });
  });

  describe('withBatch', () => {
    it('stages writes on the batch and commits once', async () => {
      const { db, state } = makeFakeDb();
      await run(
        db,
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

      expect(state.batchesCreated).toBe(1);
      expect(state.commits).toBe(1);
      expect(state.batchOps.map((op) => op[0])).toEqual([
        'set',
        'update',
        'delete',
        'create',
      ]);
      expect(state.directOps).toEqual([]);
    });

    it('reads bypass the batch and hit the database directly', async () => {
      const { db, state } = makeFakeDb();
      await run(
        db,
        withService((fs) =>
          fs.withBatch(
            Effect.gen(function* () {
              yield* fs.get('posts/1');
              yield* fs.query('posts', []);
            })
          )
        )
      );

      expect(state.directOps.map((op) => op[0])).toEqual(['get', 'query']);
      expect(state.batchOps).toEqual([]);
    });

    it('does not commit when the effect fails', async () => {
      const { db, state } = makeFakeDb();
      const exit = await runExit(
        db,
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
      expect(state.commits).toBe(0);
    });

    it('joins the ambient batch when nested', async () => {
      const { db, state } = makeFakeDb();
      await run(
        db,
        withService((fs) =>
          fs.withBatch(
            Effect.gen(function* () {
              yield* fs.set('posts/1', { title: 'a' });
              yield* fs.withBatch(fs.set('posts/2', { title: 'b' }));
            })
          )
        )
      );

      expect(state.batchesCreated).toBe(1);
      expect(state.commits).toBe(1);
      expect(state.batchOps).toHaveLength(2);
    });

    it('routes writes to the transaction when used inside withTransaction', async () => {
      const { db, state } = makeFakeDb();
      await run(
        db,
        withService((fs) =>
          fs.withTransaction(fs.withBatch(fs.set('posts/1', { title: 'a' })))
        )
      );

      expect(state.batchesCreated).toBe(0);
      expect(state.txOps.map((op) => op[0])).toEqual(['set']);
    });

    it('dies when deleteRecursive is used inside a batch', async () => {
      const { db } = makeFakeDb();
      const exit = await runExit(
        db,
        withService((fs) => fs.withBatch(fs.deleteRecursive('posts/1')))
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasDies(exit.cause)).toBe(true);
      }
    });
  });

  describe('outside a transaction or batch', () => {
    it('reads and writes go directly to the database', async () => {
      const { db, state } = makeFakeDb();
      await run(
        db,
        withService((fs) =>
          Effect.gen(function* () {
            yield* fs.get('posts/1');
            yield* fs.set('posts/1', { title: 'a' });
            yield* fs.delete('posts/2');
          })
        )
      );

      expect(state.directOps.map((op) => op[0])).toEqual([
        'get',
        'set',
        'delete',
      ]);
      expect(state.txOps).toEqual([]);
      expect(state.batchOps).toEqual([]);
    });
  });
});
