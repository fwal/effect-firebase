import { describe, expect, it } from 'vitest';
import { Cause, Effect, Exit, Result, Stream } from 'effect';
import { FirestoreError, FirestoreService } from 'effect-firebase';
import type { Firestore } from 'firebase-admin/firestore';
import { layerFromFirestore } from './firestore-service.js';

const segments = (path: string) => path.split('/');
const allNonEmpty = (path: string) => segments(path).every((s) => s.length > 0);
const docPathValid = (path: string) =>
  segments(path).length % 2 === 0 && allNonEmpty(path);
const collectionPathValid = (path: string) =>
  segments(path).length % 2 === 1 && allNonEmpty(path);

type Op = readonly [name: string, ...args: unknown[]];

const makeFakeDb = () => {
  const state = { directOps: [] as Array<Op> };

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
      onSnapshot: () => () => undefined,
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
      where: () => collection,
      orderBy: () => collection,
      limit: () => collection,
      limitToLast: () => collection,
      startAt: () => collection,
      startAfter: () => collection,
      endAt: () => collection,
      endBefore: () => collection,
      onSnapshot: () => () => undefined,
    };
    return collection;
  };

  const fakeCollectionGroup = (id: string): Record<string, unknown> => ({
    path: `group:${id}`,
    get: async () => {
      state.directOps.push(['queryGroup', id]);
      return {
        docs: [
          fakeSnapshot(`posts/p1/${id}/1`, { title: 'nested' }),
          fakeSnapshot(`users/u1/${id}/2`, { title: 'nested' }),
        ],
      };
    },
    where: () => fakeCollectionGroup(id),
    orderBy: () => fakeCollectionGroup(id),
    limit: () => fakeCollectionGroup(id),
  });

  const db = {
    doc: (path: string) => {
      if (!docPathValid(path)) {
        throw new Error(
          `Value for argument "documentPath" must point to a document, but was "${path}". Your path does not have an even number of segments.`,
        );
      }
      return fakeDocRef(path);
    },
    collection: (path: string) => {
      if (!collectionPathValid(path)) {
        throw new Error(
          `Value for argument "collectionPath" must point to a collection, but was "${path}". Your path does not have an odd number of segments.`,
        );
      }
      return fakeCollection(path);
    },
    collectionGroup: (id: string) => fakeCollectionGroup(id),
    recursiveDelete: async (ref: { path: string }) => {
      state.directOps.push(['recursiveDelete', ref.path]);
    },
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: async (ref: { path: string }) =>
          fakeSnapshot(ref.path, { title: 'tx' }),
        create: () => undefined,
        set: () => undefined,
        update: () => undefined,
        delete: () => undefined,
      }),
    batch: () => ({
      create: () => undefined,
      set: () => undefined,
      update: () => undefined,
      delete: () => undefined,
      commit: async () => undefined,
    }),
  };

  return { db: db as unknown as Firestore, state };
};

const withService = <A, E>(
  f: (service: FirestoreService['Service']) => Effect.Effect<A, E>,
) => Effect.flatMap(FirestoreService, f);

const runExit = (
  db: Firestore,
  effect: Effect.Effect<unknown, unknown, FirestoreService>,
) => Effect.runPromiseExit(effect.pipe(Effect.provide(layerFromFirestore(db))));

const run = <A, E>(
  db: Firestore,
  effect: Effect.Effect<A, E, FirestoreService>,
) => Effect.runPromise(effect.pipe(Effect.provide(layerFromFirestore(db))));

const expectTypedInvalidArgument = (exit: Exit.Exit<unknown, unknown>) => {
  expect(Exit.isFailure(exit)).toBe(true);
  if (!Exit.isFailure(exit)) return;
  expect(Cause.hasDies(exit.cause)).toBe(false);
  const failure = Cause.findFail(exit.cause);
  const error = Result.getOrThrow(failure).error as FirestoreError;
  expect(error._tag).toBe('FirestoreError');
  expect(error.code).toBe('invalid-argument');
};

describe('FirestoreService (admin) path parity', () => {
  describe('broken before the fix: set / delete / add-writer die as defects', () => {
    it('set on a collection-parity path fails with a typed FirestoreError', async () => {
      const { db } = makeFakeDb();
      const exit = await runExit(
        db,
        withService((fs) => fs.set('posts/1/comments', { title: 'a' })),
      );
      expectTypedInvalidArgument(exit);
    });

    it('delete on a collection-parity path fails with a typed FirestoreError', async () => {
      const { db } = makeFakeDb();
      const exit = await runExit(
        db,
        withService((fs) => fs.delete('posts/1/comments')),
      );
      expectTypedInvalidArgument(exit);
    });

    it('add writer branch on a document-parity path fails with a typed FirestoreError', async () => {
      const { db } = makeFakeDb();
      const exit = await runExit(
        db,
        withService((fs) => fs.withBatch(fs.add('posts/1', { title: 'a' }))),
      );
      expectTypedInvalidArgument(exit);
    });
  });

  describe('broken before the fix: streamDoc / streamQuery stall the consumer', () => {
    it('streamDoc on a collection-parity path fails fast with a typed FirestoreError', async () => {
      const { db } = makeFakeDb();
      const exit = await runExit(
        db,
        withService((fs) =>
          Effect.timeoutOption(
            Stream.runCollect(fs.streamDoc('posts/1/comments')),
            '250 millis',
          ),
        ),
      );
      expectTypedInvalidArgument(exit);
    });

    it('streamQuery on a document-parity path fails fast with a typed FirestoreError', async () => {
      const { db } = makeFakeDb();
      const exit = await runExit(
        db,
        withService((fs) =>
          Effect.timeoutOption(
            Stream.runCollect(fs.streamQuery('posts/1', [])),
            '250 millis',
          ),
        ),
      );
      expectTypedInvalidArgument(exit);
    });
  });

  describe('get / update / add-direct / query / deleteRecursive fail with a typed FirestoreError', () => {
    it('get on a collection-parity path fails with a typed FirestoreError', async () => {
      const { db } = makeFakeDb();
      const exit = await runExit(
        db,
        withService((fs) => fs.get('posts/1/comments')),
      );
      expectTypedInvalidArgument(exit);
    });

    it('update on a collection-parity path fails with a typed FirestoreError', async () => {
      const { db } = makeFakeDb();
      const exit = await runExit(
        db,
        withService((fs) => fs.update('posts/1/comments', { title: 'a' })),
      );
      expectTypedInvalidArgument(exit);
    });

    it('add direct branch on a document-parity path fails with a typed FirestoreError', async () => {
      const { db } = makeFakeDb();
      const exit = await runExit(
        db,
        withService((fs) => fs.add('posts/1', { title: 'a' })),
      );
      expectTypedInvalidArgument(exit);
    });

    it('query on a document-parity path fails with a typed FirestoreError', async () => {
      const { db } = makeFakeDb();
      const exit = await runExit(
        db,
        withService((fs) => fs.query('posts/1', [])),
      );
      expectTypedInvalidArgument(exit);
    });

    it('deleteRecursive on a collection-parity path fails with a typed FirestoreError', async () => {
      const { db } = makeFakeDb();
      const exit = await runExit(
        db,
        withService((fs) => fs.deleteRecursive('posts/1/comments')),
      );
      expectTypedInvalidArgument(exit);
    });

    it('streamQueryGroup on a slash-containing collection id fails typed (existing guard)', async () => {
      const { db } = makeFakeDb();
      const exit = await runExit(
        db,
        withService((fs) =>
          Effect.timeoutOption(
            Stream.runCollect(fs.streamQueryGroup('a/b', [])),
            '250 millis',
          ),
        ),
      );
      expectTypedInvalidArgument(exit);
    });
  });

  describe('valid paths are not falsely rejected', () => {
    it('set / delete / add / get / query / deleteRecursive reach the SDK for correctly-paritied paths', async () => {
      const { db, state } = makeFakeDb();
      await run(
        db,
        withService((fs) =>
          Effect.gen(function* () {
            yield* fs.set('posts/1', { title: 'a' });
            yield* fs.delete('posts/2');
            const added = yield* fs.add('posts', { title: 'c' });
            expect(added).toEqual({ id: 'added-id', path: 'posts/added-id' });
            yield* fs.get('posts/1');
            yield* fs.query('posts', []);
            yield* fs.deleteRecursive('posts/3');
          }),
        ),
      );
      expect(state.directOps.map((op) => op[0])).toEqual([
        'set',
        'delete',
        'add',
        'get',
        'query',
        'recursiveDelete',
      ]);
    });

    it('writes inside withBatch reach the batch for correctly-paritied paths', async () => {
      const { db } = makeFakeDb();
      await run(
        db,
        withService((fs) =>
          fs.withBatch(
            Effect.gen(function* () {
              yield* fs.set('posts/1', { title: 'a' });
              yield* fs.delete('posts/2');
              const added = yield* fs.add('posts', { title: 'c' });
              expect(added).toEqual({
                id: 'generated-id',
                path: 'posts/generated-id',
              });
            }),
          ),
        ),
      );
    });
  });
});
