import { describe, expect, it, vi } from 'vitest';
import { Effect, Layer, Option, Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import { makeRepository } from './repository.js';
import { FirestoreService } from '../firestore-service.js';
import type { FirestoreServiceShape } from '../firestore-service.js';
import type { Snapshot } from '../snapshot.js';

const PostId = Schema.String.pipe(Schema.brand('PostId'));

class PostModel extends Model.Class<PostModel>('PostModel')({
  id: Model.Generated(PostId),
  title: Schema.String,
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

const snap = (id: string, data: Record<string, unknown>): Snapshot =>
  [{ id, path: `posts/${id}` }, data] as const;

describe('Repository', () => {
  describe('add', () => {
    it('calls firestore.add with the collection path and encoded data', async () => {
      const addMock = vi.fn(() =>
        Effect.succeed({ id: 'new-id', path: 'posts/new-id' })
      );
      const repo = await Effect.runPromise(makeRepo({ add: addMock }));
      const id = await Effect.runPromise(repo.add({ title: 'Hello' }));

      expect(addMock).toHaveBeenCalledWith('posts', { title: 'Hello' });
      expect(id).toBe('new-id');
    });
  });

  describe('getById', () => {
    it('returns Some with the decoded model when the document exists', async () => {
      const getMock = vi.fn(() =>
        Effect.succeed(Option.some(snap('post-1', { title: 'Hello' })))
      );
      const repo = await Effect.runPromise(makeRepo({ get: getMock }));
      const result = await Effect.runPromise(
        repo.getById(PostId.make('post-1'))
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
        repo.getById(PostId.make('post-1'))
      );

      expect(Option.isNone(result)).toBe(true);
    });
  });

  describe('update', () => {
    it('calls firestore.update with the correct path and partial data', async () => {
      const updateMock = vi.fn(() => Effect.succeed(undefined));
      const repo = await Effect.runPromise(makeRepo({ update: updateMock }));
      await Effect.runPromise(
        repo.update(PostId.make('post-1'), { title: 'Updated' })
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
        makeRepo({ deleteRecursive: deleteRecursiveMock })
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
        ])
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
        ])
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
