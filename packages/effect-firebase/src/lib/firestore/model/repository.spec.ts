import { describe, expect, it, vi } from 'vitest';
import { Effect, Layer, Option, Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import { makeRepository } from './repository.js';
import * as FirestoreModel from './datetime.js';
import { FirestoreService } from '../firestore-service.js';
import type { FirestoreServiceShape } from '../firestore-service.js';
import type { Snapshot } from '../snapshot.js';

const PostId = Schema.String.pipe(Schema.brand('PostId'));

class PostModel extends Model.Class<PostModel>('PostModel')({
  id: Model.GeneratedByDb(PostId),
  title: Schema.String,
}) {}

/** Carries an insert-only field (createdAt) and an insert+update one. */
class StampedModel extends Model.Class<StampedModel>('StampedModel')({
  id: Model.GeneratedByDb(PostId),
  title: Schema.String,
  createdAt: FirestoreModel.DateTimeInsert,
  updatedAt: FirestoreModel.DateTimeUpdate,
}) {}

const notMocked = (name: string) => (): never => {
  throw new Error(`FirestoreService.${name}: not mocked`);
};

const makeLayer = (overrides: Partial<FirestoreServiceShape>) =>
  Layer.succeed(FirestoreService, {
    get: notMocked('get'),
    add: notMocked('add'),
    set: notMocked('set'),
    update: notMocked('update'),
    delete: notMocked('delete'),
    deleteRecursive: notMocked('deleteRecursive'),
    query: notMocked('query'),
    streamDoc: notMocked('streamDoc'),
    streamQuery: notMocked('streamQuery'),
    ...overrides,
  } as FirestoreServiceShape);

const makeRepo = (overrides: Partial<FirestoreServiceShape>) =>
  makeRepository(PostModel, {
    collectionPath: 'posts',
    idField: 'id',
    spanPrefix: 'test',
  }).pipe(Effect.provide(makeLayer(overrides)));

const makeStampedRepo = (overrides: Partial<FirestoreServiceShape>) =>
  makeRepository(StampedModel, {
    collectionPath: 'posts',
    idField: 'id',
    spanPrefix: 'test',
  }).pipe(Effect.provide(makeLayer(overrides)));

const snap = (id: string, data: Record<string, unknown>): Snapshot =>
  [{ id, path: `posts/${id}` }, data] as const;

describe('Repository', () => {
  describe('add', () => {
    it('calls firestore.add with the collection path and encoded data', async () => {
      const addMock = vi.fn(() =>
        Effect.succeed({ id: 'new-id', path: 'posts/new-id' }),
      );
      const repo = await Effect.runPromise(makeRepo({ add: addMock }));
      const id = await Effect.runPromise(repo.add({ title: 'Hello' }));

      expect(addMock).toHaveBeenCalledWith('posts', { title: 'Hello' });
      expect(id).toBe('new-id');
    });
  });

  describe('set', () => {
    // Typed so the recorded call is indexable without casts, and so a
    // change to the service signature shows up here.
    const setSpy = () =>
      vi.fn(
        (
          _path: string,
          _data: Record<string, unknown>,
          _options?: { readonly merge?: boolean },
        ) => Effect.succeed(undefined),
      );

    it('calls firestore.set with the document path and encoded data', async () => {
      const setMock = setSpy();
      const repo = await Effect.runPromise(makeRepo({ set: setMock }));
      await Effect.runPromise(
        repo.set(PostId.make('post-1'), { data: { title: 'Hello' } }),
      );

      expect(setMock).toHaveBeenCalledWith(
        'posts/post-1',
        { title: 'Hello' },
        undefined,
      );
    });

    it('forwards merge to firestore.set', async () => {
      const setMock = setSpy();
      const repo = await Effect.runPromise(makeRepo({ set: setMock }));
      await Effect.runPromise(
        repo.set(PostId.make('post-1'), {
          data: { title: 'Hello' },
          merge: true,
        }),
      );

      expect(setMock).toHaveBeenCalledWith(
        'posts/post-1',
        { title: 'Hello' },
        { merge: true },
      );
    });

    it('does not merge when the flag is omitted or false', async () => {
      const setMock = setSpy();
      const repo = await Effect.runPromise(makeRepo({ set: setMock }));
      await Effect.runPromise(
        repo.set(PostId.make('post-1'), {
          data: { title: 'Hello' },
          merge: false,
        }),
      );

      expect(setMock).toHaveBeenCalledWith(
        'posts/post-1',
        { title: 'Hello' },
        undefined,
      );
    });

    // The variant decides what happens to insert-only fields (createdAt).
    // These pin both branches: changing what a variant sends is a
    // data-loss-shaped change and should fail here first. The payloads are
    // deliberately written as a consumer would write them, with no casts,
    // so a regression in the SetWrite typing breaks compilation too.
    const payloadOf = (mock: ReturnType<typeof setSpy>) =>
      Object.keys(mock.mock.calls[0][1]).sort();

    it("variant 'insert' (the default) sends insert-only fields", async () => {
      const setMock = setSpy();
      const repo = await Effect.runPromise(makeStampedRepo({ set: setMock }));
      await Effect.runPromise(
        repo.set(PostId.make('post-1'), {
          data: {
            title: 'Hello',
            createdAt: undefined,
            updatedAt: undefined,
          },
        }),
      );

      expect(payloadOf(setMock)).toEqual(['createdAt', 'title', 'updatedAt']);
    });

    it("variant 'insert' still sends createdAt under merge, re-stamping it", async () => {
      const setMock = setSpy();
      const repo = await Effect.runPromise(makeStampedRepo({ set: setMock }));
      await Effect.runPromise(
        repo.set(PostId.make('post-1'), {
          data: {
            title: 'Hello',
            createdAt: undefined,
            updatedAt: undefined,
          },
          merge: true,
        }),
      );

      expect(payloadOf(setMock)).toContain('createdAt');
    });

    it("variant 'update' omits insert-only fields, so a merge preserves them", async () => {
      const setMock = setSpy();
      const repo = await Effect.runPromise(makeStampedRepo({ set: setMock }));
      await Effect.runPromise(
        repo.set(PostId.make('post-1'), {
          variant: 'update',
          data: { title: 'Hello', updatedAt: undefined },
          merge: true,
        }),
      );

      expect(payloadOf(setMock)).toEqual(['title', 'updatedAt']);
      expect(setMock.mock.calls[0][2]).toEqual({ merge: true });
    });

    // Type-level guards on the discriminated union. Each @ts-expect-error
    // fails compilation if the error it suppresses ever disappears, so the
    // two branches cannot silently collapse into one. The effects are built
    // but never run: encoding happens on run, and one of these payloads is
    // deliberately invalid.
    it('types each variant to its own schema', async () => {
      const repo = await Effect.runPromise(makeStampedRepo({}));

      const updateWithInsertOnlyField = repo.set(PostId.make('post-1'), {
        variant: 'update',
        // @ts-expect-error createdAt is insert-only, absent from the update
        // variant.
        data: { title: 'Hello', createdAt: undefined, updatedAt: undefined },
      });

      const insertMissingInsertOnlyField = repo.set(
        PostId.make('post-1'),
        // @ts-expect-error the default insert variant requires createdAt.
        { data: { title: 'Hello', updatedAt: undefined } },
      );

      expect(updateWithInsertOnlyField).toBeDefined();
      expect(insertMissingInsertOnlyField).toBeDefined();
    });
  });

  describe('getById', () => {
    it('returns Some with the decoded model when the document exists', async () => {
      const getMock = vi.fn(() =>
        Effect.succeed(Option.some(snap('post-1', { title: 'Hello' }))),
      );
      const repo = await Effect.runPromise(makeRepo({ get: getMock }));
      const result = await Effect.runPromise(
        repo.getById(PostId.make('post-1')),
      );

      expect(getMock).toHaveBeenCalledWith('posts/post-1');
      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrThrow(result)).toMatchObject({
        id: 'post-1',
        title: 'Hello',
      });
    });

    it('returns None when the document does not exist', async () => {
      const getMock = vi.fn(() => Effect.succeed(Option.none()));
      const repo = await Effect.runPromise(makeRepo({ get: getMock }));
      const result = await Effect.runPromise(
        repo.getById(PostId.make('post-1')),
      );

      expect(Option.isNone(result)).toBe(true);
    });
  });

  describe('update', () => {
    it('calls firestore.update with the correct path and partial data', async () => {
      const updateMock = vi.fn(() => Effect.succeed(undefined));
      const repo = await Effect.runPromise(makeRepo({ update: updateMock }));
      await Effect.runPromise(
        repo.update(PostId.make('post-1'), { title: 'Updated' }),
      );

      expect(updateMock).toHaveBeenCalledWith('posts/post-1', {
        title: 'Updated',
      });
    });
  });

  describe('delete', () => {
    it('calls firestore.delete with the correct path', async () => {
      const deleteMock = vi.fn(() => Effect.succeed(undefined));
      const repo = await Effect.runPromise(makeRepo({ delete: deleteMock }));
      await Effect.runPromise(repo.delete(PostId.make('post-1')));

      expect(deleteMock).toHaveBeenCalledWith('posts/post-1');
    });
  });

  describe('deleteRecursive', () => {
    it('calls firestore.deleteRecursive with the correct path', async () => {
      const deleteRecursiveMock = vi.fn(() => Effect.succeed(undefined));
      const repo = await Effect.runPromise(
        makeRepo({ deleteRecursive: deleteRecursiveMock }),
      );
      await Effect.runPromise(repo.deleteRecursive(PostId.make('post-1')));

      expect(deleteRecursiveMock).toHaveBeenCalledWith('posts/post-1');
    });
  });

  describe('query', () => {
    it('calls firestore.query with the collection path and constraints', async () => {
      const queryMock = vi.fn(() =>
        Effect.succeed([
          snap('post-1', { title: 'First' }),
          snap('post-2', { title: 'Second' }),
        ]),
      );
      const repo = await Effect.runPromise(makeRepo({ query: queryMock }));
      const results = await Effect.runPromise(repo.query([]));

      expect(queryMock).toHaveBeenCalledWith('posts', []);
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ id: 'post-1', title: 'First' });
      expect(results[1]).toMatchObject({ id: 'post-2', title: 'Second' });
    });

    it('returns an empty array when there are no results', async () => {
      const queryMock = vi.fn(() => Effect.succeed([]));
      const repo = await Effect.runPromise(makeRepo({ query: queryMock }));
      const results = await Effect.runPromise(repo.query([]));

      expect(results).toHaveLength(0);
    });
  });

  describe('getByQuery', () => {
    it('returns Some with the first result when results exist', async () => {
      const queryMock = vi.fn(() =>
        Effect.succeed([
          snap('post-1', { title: 'First' }),
          snap('post-2', { title: 'Second' }),
        ]),
      );
      const repo = await Effect.runPromise(makeRepo({ query: queryMock }));
      const result = await Effect.runPromise(repo.getByQuery([]));

      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrThrow(result)).toMatchObject({
        id: 'post-1',
        title: 'First',
      });
    });

    it('returns None when there are no results', async () => {
      const queryMock = vi.fn(() => Effect.succeed([]));
      const repo = await Effect.runPromise(makeRepo({ query: queryMock }));
      const result = await Effect.runPromise(repo.getByQuery([]));

      expect(Option.isNone(result)).toBe(true);
    });
  });
});
