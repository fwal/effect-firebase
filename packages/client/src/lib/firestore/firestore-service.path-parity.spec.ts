import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Cause, Effect, Exit, Result, Stream } from 'effect';
import { FirestoreError, FirestoreService } from 'effect-firebase';
import type { Firestore } from 'firebase/firestore';

const h = vi.hoisted(() => {
  const state = {
    directOps: [] as Array<readonly [name: string, ...args: unknown[]]>,
  };

  const reset = () => {
    state.directOps = [];
  };

  const idOf = (path: string) => path.split('/').pop() as string;

  // Mirror the real SDK: doc()/collection() validate path parity synchronously
  // and throw a FirebaseError('invalid-argument') before any I/O. This is the
  // throw the client layer must not let escape as a defect / stream stall.
  class FirebaseError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'FirebaseError';
    }
  }

  const segments = (path: string) => path.split('/');
  const allNonEmpty = (path: string) =>
    segments(path).every((s) => s.length > 0);
  const docPathValid = (path: string) =>
    segments(path).length % 2 === 0 && allNonEmpty(path);
  const collectionPathValid = (path: string) =>
    segments(path).length % 2 === 1 && allNonEmpty(path);

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

  return {
    state,
    reset,
    FirebaseError,
    docPathValid,
    collectionPathValid,
    fakeDocRef,
    fakeCollection,
  };
});

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  const idOf = (path: string) => path.split('/').pop() as string;
  const fakeSnapshot = (path: string, data: Record<string, unknown>) => ({
    id: idOf(path),
    ref: { id: idOf(path), path },
    data: () => data,
  });
  return {
    ...actual,
    doc: (dbOrCollection: { path?: string }, path?: string) => {
      if (path !== undefined) {
        if (!h.docPathValid(path)) {
          throw new h.FirebaseError(
            'invalid-argument',
            `Invalid document reference. Document references must have an even number of segments, but ${path} has ${path.split('/').length}.`,
          );
        }
        return h.fakeDocRef(path);
      }
      return h.fakeDocRef(`${dbOrCollection.path}/generated-id`);
    },
    collection: (_db: unknown, path: string) => {
      if (!h.collectionPathValid(path)) {
        throw new h.FirebaseError(
          'invalid-argument',
          `Invalid collection reference. Collection references must have an odd number of segments, but ${path} has ${path.split('/').length}.`,
        );
      }
      return h.fakeCollection(path);
    },
    collectionGroup: (_db: unknown, id: string) => ({ path: `group:${id}` }),
    query: (ref: unknown) => ref,
    getDoc: async (ref: { path: string }) => {
      h.state.directOps.push(['get', ref.path]);
      return fakeSnapshot(ref.path, { title: 'direct' });
    },
    getDocs: async (q: { path: string }) => {
      h.state.directOps.push(['query', q.path]);
      return { docs: [fakeSnapshot(`${q.path}/1`, { title: 'direct' })] };
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
    onSnapshot: () => () => undefined,
    runTransaction: async <T>(_db: unknown, fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: async (ref: { path: string }) =>
          fakeSnapshot(ref.path, { title: 'tx' }),
        set: () => undefined,
        update: () => undefined,
        delete: () => undefined,
      }),
    writeBatch: () => ({
      set: () => undefined,
      update: () => undefined,
      delete: () => undefined,
      commit: async () => undefined,
    }),
  };
});

// Imported after the mock so the service uses the mocked SDK functions.
import { layerFromFirestore } from './firestore-service.js';

const db = {} as Firestore;

const withService = <A, E>(
  f: (service: FirestoreService['Service']) => Effect.Effect<A, E>,
) => Effect.flatMap(FirestoreService, f);

const runExit = <A, E>(effect: Effect.Effect<A, E, FirestoreService>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(layerFromFirestore(db))));

const run = <A, E>(effect: Effect.Effect<A, E, FirestoreService>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layerFromFirestore(db))));

const expectTypedInvalidArgument = (exit: Exit.Exit<unknown, unknown>) => {
  expect(Exit.isFailure(exit)).toBe(true);
  if (!Exit.isFailure(exit)) return;
  expect(Cause.hasDies(exit.cause)).toBe(false);
  const failure = Cause.findFail(exit.cause);
  const error = Result.getOrThrow(failure).error as FirestoreError;
  expect(error._tag).toBe('FirestoreError');
  expect(error.code).toBe('invalid-argument');
};

beforeEach(() => {
  h.reset();
});

describe('FirestoreService (client) path parity', () => {
  describe('broken before the fix: set / delete / add-writer die as defects', () => {
    it('set on a collection-parity path fails with a typed FirestoreError', async () => {
      const exit = await runExit(
        withService((fs) => fs.set('posts/1/comments', { title: 'a' })),
      );
      expectTypedInvalidArgument(exit);
    });

    it('delete on a collection-parity path fails with a typed FirestoreError', async () => {
      const exit = await runExit(
        withService((fs) => fs.delete('posts/1/comments')),
      );
      expectTypedInvalidArgument(exit);
    });

    it('add writer branch on a document-parity path fails with a typed FirestoreError', async () => {
      const exit = await runExit(
        withService((fs) => fs.withBatch(fs.add('posts/1', { title: 'a' }))),
      );
      expectTypedInvalidArgument(exit);
    });
  });

  describe('broken before the fix: streamDoc / streamQuery stall the consumer', () => {
    // timeoutOption resolves to Exit.fail when the stream fails fast (fix in
    // place), and to Exit.succeed(Option.none()) after the timeout when the
    // stream stalls (fix absent). Asserting a typed failure therefore also
    // guards against the regression to a stall.
    it('streamDoc on a collection-parity path fails fast with a typed FirestoreError', async () => {
      const exit = await runExit(
        withService((fs) =>
          Effect.timeoutOption(
            Stream.runCollect(fs.streamDoc('posts/1/comments')),
            '250 millis',
          ),
        ),
      );
      expectTypedInvalidArgument(exit);
      if (Exit.isFailure(exit)) {
        // The store did not stall: the timeout branch (success None) was not taken.
        expect(Cause.hasDies(exit.cause)).toBe(false);
      }
    });

    it('streamQuery on a document-parity path fails fast with a typed FirestoreError', async () => {
      const exit = await runExit(
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

  describe('already safe: get / update / add-direct / query catch the throw', () => {
    it('get on a collection-parity path fails with a typed FirestoreError', async () => {
      const exit = await runExit(
        withService((fs) => fs.get('posts/1/comments')),
      );
      expectTypedInvalidArgument(exit);
    });

    it('update on a collection-parity path fails with a typed FirestoreError', async () => {
      const exit = await runExit(
        withService((fs) => fs.update('posts/1/comments', { title: 'a' })),
      );
      expectTypedInvalidArgument(exit);
    });

    it('add direct branch on a document-parity path fails with a typed FirestoreError', async () => {
      const exit = await runExit(
        withService((fs) => fs.add('posts/1', { title: 'a' })),
      );
      expectTypedInvalidArgument(exit);
    });

    it('query on a document-parity path fails with a typed FirestoreError', async () => {
      const exit = await runExit(withService((fs) => fs.query('posts/1', [])));
      expectTypedInvalidArgument(exit);
    });

    it('streamQueryGroup on a slash-containing collection id fails typed (existing guard)', async () => {
      const exit = await runExit(
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
    it('set / delete / add reach the SDK for correctly-paritied paths', async () => {
      await run(
        withService((fs) =>
          Effect.gen(function* () {
            yield* fs.set('posts/1', { title: 'a' });
            yield* fs.delete('posts/2');
            const added = yield* fs.add('posts', { title: 'c' });
            expect(added).toEqual({ id: 'added-id', path: 'posts/added-id' });
            yield* fs.get('posts/1');
            yield* fs.query('posts', []);
          }),
        ),
      );
      expect(h.state.directOps.map((op) => op[0])).toEqual([
        'set',
        'delete',
        'add',
        'get',
        'query',
      ]);
    });

    it('writes inside withBatch reach the batch for correctly-paritied paths', async () => {
      await run(
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
