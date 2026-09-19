import { describe, expect, it, vi } from 'vitest';
import {
  Cause,
  DateTime,
  Effect,
  Exit,
  Layer,
  Option,
  Schema,
  Stream,
} from 'effect';
import { delete as deleteField } from '../fields/delete.js';
import { Model } from 'effect/unstable/schema';
import { makeRepository } from './repository.js';
import * as FirestoreModel from './datetime.js';
import * as FirestoreNumber from './number.js';
import { OptionalDeletable } from './optional.js';
import { increment } from '../fields/increment.js';
import {
  ServerTimestamp,
  Timestamp,
  TimestampDateTimeUtc,
} from '../schema/timestamp.js';
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

/** Nested maps declared through the combinators a field path may cross. */
class NestedModel extends Model.Class<NestedModel>('NestedModel')({
  id: Model.GeneratedByDb(PostId),
  title: Schema.String,
  metaData: Schema.Struct({
    deleted: Schema.Boolean,
    tags: Schema.Array(Schema.String),
  }),
  stats: Model.Struct({ likes: FirestoreNumber.Number }),
  profile: OptionalDeletable(
    Schema.Struct({ lastSeenAt: TimestampDateTimeUtc }),
  ),
  counters: Schema.Record(Schema.String, Schema.Number),
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
    queryGroup: notMocked('queryGroup'),
    streamDoc: notMocked('streamDoc'),
    streamQuery: notMocked('streamQuery'),
    streamQueryGroup: notMocked('streamQueryGroup'),
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

const makeNestedRepo = (overrides: Partial<FirestoreServiceShape>) =>
  makeRepository(NestedModel, {
    collectionPath: 'posts',
    idField: 'id',
    spanPrefix: 'test',
  }).pipe(Effect.provide(makeLayer(overrides)));

const failureOf = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(Effect.flip(effect));

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

      // Server-stamped fields may be omitted from the insert variant.
      const insertWithoutStampedFields = repo.set(PostId.make('post-1'), {
        data: { title: 'Hello' },
      });

      expect(updateWithInsertOnlyField).toBeDefined();
      expect(insertWithoutStampedFields).toBeDefined();
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

    it('applies decoding defaults from spread struct fields', async () => {
      // Regression for fields spread from a struct that carries a decoding
      // default: the model must accept them and fill the default on read.
      const WithDefault = Schema.Struct({
        status: Schema.optionalKey(Schema.String).pipe(
          Schema.withDecodingDefault(Effect.succeed('draft')),
        ),
      });
      class DefaultedModel extends Model.Class<DefaultedModel>(
        'DefaultedModel',
      )({
        id: Model.GeneratedByDb(PostId),
        ...WithDefault.fields,
      }) {}
      const getMock = vi.fn(() =>
        Effect.succeed(Option.some(snap('post-1', {}))),
      );
      const repo = await Effect.runPromise(
        makeRepository(DefaultedModel, {
          collectionPath: 'posts',
          idField: 'id',
          spanPrefix: 'test',
        }).pipe(Effect.provide(makeLayer({ get: getMock }))),
      );
      const result = await Effect.runPromise(
        repo.getById(PostId.make('post-1')),
      );

      expect(Option.getOrThrow(result)).toMatchObject({
        id: 'post-1',
        status: 'draft',
      });
      expect(Schema.encodeSync(DefaultedModel.insert)({})).toEqual({});
      expect(Schema.decodeUnknownSync(DefaultedModel.insert)({}).status).toBe(
        'draft',
      );
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

  describe('set strictness', () => {
    it('rejects a key the model does not declare', async () => {
      const setMock = vi.fn(() => Effect.succeed(undefined));
      const repo = await Effect.runPromise(makeRepo({ set: setMock }));
      const error = await failureOf(
        repo.set(PostId.make('post-1'), {
          // @ts-expect-error not a declared field
          data: { title: 'Hello', extra: 1 },
        }),
      );

      expect(error._tag).toBe('SchemaError');
      expect(String(error)).toContain('extra');
      expect(setMock).not.toHaveBeenCalled();
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

    it('rejects a key the model does not declare instead of dropping it (#63)', async () => {
      const updateMock = vi.fn(() => Effect.succeed(undefined));
      const repo = await Effect.runPromise(makeRepo({ update: updateMock }));
      const error = await failureOf(
        repo.update(PostId.make('post-1'), {
          // @ts-expect-error not a declared field
          'metaData.deleted': true,
        }),
      );

      expect(error._tag).toBe('SchemaError');
      expect(String(error)).toContain('metaData.deleted');
      expect(updateMock).not.toHaveBeenCalled();
    });

    it('fails an empty payload with invalid-argument before reaching Firestore', async () => {
      const updateMock = vi.fn(() => Effect.succeed(undefined));
      const repo = await Effect.runPromise(makeRepo({ update: updateMock }));
      const error = await failureOf(repo.update(PostId.make('post-1'), {}));

      expect(error).toMatchObject({
        _tag: 'FirestoreError',
        code: 'invalid-argument',
      });
      expect(updateMock).not.toHaveBeenCalled();
    });

    describe('field paths', () => {
      const payloadOf = (mock: ReturnType<typeof vi.fn>) =>
        (mock.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];

      it('passes a dotted path into a nested struct through unchanged', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeNestedRepo({ update: updateMock }),
        );
        await Effect.runPromise(
          repo.update(PostId.make('post-1'), {
            title: 'Updated',
            'metaData.deleted': true,
          }),
        );

        expect(updateMock).toHaveBeenCalledWith('posts/post-1', {
          title: 'Updated',
          'metaData.deleted': true,
        });
      });

      it('encodes a nested leaf through its own field schema', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeNestedRepo({ update: updateMock }),
        );
        await Effect.runPromise(
          repo.update(PostId.make('post-1'), {
            'profile.lastSeenAt': DateTime.makeUnsafe(1_000),
          }),
        );

        const encoded = payloadOf(updateMock)['profile.lastSeenAt'];
        expect(encoded).toBeInstanceOf(Timestamp);
        expect((encoded as Timestamp).toMillis()).toBe(1_000);
      });

      it('accepts a sentinel on a nested field declared for it', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeNestedRepo({ update: updateMock }),
        );
        await Effect.runPromise(
          repo.update(PostId.make('post-1'), { 'stats.likes': increment(1) }),
        );

        expect(payloadOf(updateMock)['stats.likes']).toEqual(increment(1));
      });

      it('resolves dynamic keys through a Record field', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeNestedRepo({ update: updateMock }),
        );
        await Effect.runPromise(
          repo.update(PostId.make('post-1'), { 'counters.visits': 3 }),
        );

        expect(payloadOf(updateMock)).toEqual({ 'counters.visits': 3 });
      });

      it('rejects a path whose leaf is not declared, naming the path', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeNestedRepo({ update: updateMock }),
        );
        const error = await failureOf(
          repo.update(PostId.make('post-1'), {
            // @ts-expect-error `nope` is not a field of metaData
            'metaData.nope': true,
          }),
        );

        expect(error._tag).toBe('SchemaError');
        expect(String(error)).toContain('metaData.nope');
        expect(updateMock).not.toHaveBeenCalled();
      });

      it('rejects a leaf value of the wrong type, naming the path', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeNestedRepo({ update: updateMock }),
        );
        const error = await failureOf(
          repo.update(PostId.make('post-1'), {
            // @ts-expect-error deleted is a boolean
            'metaData.deleted': 'yes',
          }),
        );

        expect(error._tag).toBe('SchemaError');
        expect(String(error)).toContain('metaData.deleted');
        expect(updateMock).not.toHaveBeenCalled();
      });

      it('does not treat a scalar field as a map', () => {
        const repo = Effect.runSync(makeNestedRepo({}));
        const write = repo.update(PostId.make('post-1'), {
          // @ts-expect-error title is a string, not a map
          'title.length': 1,
        });
        expect(write).toBeDefined();
      });
    });

    describe('merge', () => {
      const payloadOf = (mock: ReturnType<typeof vi.fn>) =>
        (mock.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];

      it('flattens a nested partial into dotted paths', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeNestedRepo({ update: updateMock }),
        );
        await Effect.runPromise(
          repo.update(
            PostId.make('post-1'),
            { title: 'Updated', metaData: { deleted: true } },
            { merge: true },
          ),
        );

        expect(payloadOf(updateMock)).toEqual({
          title: 'Updated',
          'metaData.deleted': true,
        });
      });

      it('replaces the whole map without merge', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeNestedRepo({ update: updateMock }),
        );
        await Effect.runPromise(
          repo.update(PostId.make('post-1'), {
            metaData: { deleted: true, tags: [] },
          }),
        );

        expect(payloadOf(updateMock)).toEqual({
          metaData: { deleted: true, tags: [] },
        });
      });

      it('keeps arrays and sentinels whole and encodes nested leaves', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeNestedRepo({ update: updateMock }),
        );
        await Effect.runPromise(
          repo.update(
            PostId.make('post-1'),
            {
              metaData: { tags: ['a', 'b'] },
              stats: { likes: increment(1) },
              profile: Option.some({ lastSeenAt: DateTime.makeUnsafe(1_000) }),
              counters: { visits: 3 },
            },
            { merge: true },
          ),
        );

        const payload = payloadOf(updateMock);
        expect(Object.keys(payload).sort()).toEqual([
          'counters.visits',
          'metaData.tags',
          'profile.lastSeenAt',
          'stats.likes',
        ]);
        expect(payload['metaData.tags']).toEqual(['a', 'b']);
        expect(payload['stats.likes']).toEqual(increment(1));
        expect(payload['profile.lastSeenAt']).toBeInstanceOf(Timestamp);
        expect(payload['counters.visits']).toBe(3);
      });

      it('treats Option.none() and Firestore.delete() as leaves', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeNestedRepo({ update: updateMock }),
        );
        await Effect.runPromise(
          repo.update(
            PostId.make('post-1'),
            { title: 'Hello', profile: Option.none() },
            { merge: true },
          ),
        );
        await Effect.runPromise(
          repo.update(
            PostId.make('post-1'),
            { profile: Option.some(deleteField()) },
            { merge: true },
          ),
        );

        expect(updateMock.mock.calls).toHaveLength(2);
        // Option.none() leaves the field untouched: the key is omitted rather
        // than written as undefined.
        expect(payloadOf(updateMock)).toEqual({ title: 'Hello' });
        expect(payloadOf(updateMock)).not.toHaveProperty('profile');
        expect(
          (
            updateMock.mock.calls[1] as unknown as [
              string,
              Record<string, unknown>,
            ]
          )[1],
        ).toEqual({ profile: deleteField() });
      });

      it('omits a nested OptionalDeletable given Option.none()', async () => {
        class ProfileModel extends Model.Class<ProfileModel>('ProfileModel')({
          id: Model.GeneratedByDb(PostId),
          title: Schema.String,
          profile: Model.Struct({ bio: OptionalDeletable(Schema.String) }),
        }) {}
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeRepository(ProfileModel, {
            collectionPath: 'posts',
            idField: 'id',
            spanPrefix: 'test',
          }).pipe(Effect.provide(makeLayer({ update: updateMock }))),
        );
        await Effect.runPromise(
          repo.update(PostId.make('post-1'), {
            title: 'Hello',
            'profile.bio': Option.none(),
          }),
        );
        await Effect.runPromise(
          repo.update(
            PostId.make('post-1'),
            { title: 'Hello', profile: { bio: Option.none() } },
            { merge: true },
          ),
        );
        await Effect.runPromise(
          repo.update(PostId.make('post-1'), {
            'profile.bio': Option.some(deleteField()),
          }),
        );

        const payloads = updateMock.mock.calls.map(
          (call) => (call as unknown as [string, Record<string, unknown>])[1],
        );
        expect(payloads[0]).toEqual({ title: 'Hello' });
        expect(payloads[0]).not.toHaveProperty('profile.bio');
        expect(payloads[1]).toEqual({ title: 'Hello' });
        expect(payloads[1]).not.toHaveProperty('profile.bio');
        expect(payloads[2]).toEqual({ 'profile.bio': deleteField() });
      });

      it('drops empty objects, failing invalid-argument if nothing is left', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeNestedRepo({ update: updateMock }),
        );
        const error = await failureOf(
          repo.update(PostId.make('post-1'), { metaData: {} }, { merge: true }),
        );

        expect(error).toMatchObject({
          _tag: 'FirestoreError',
          code: 'invalid-argument',
        });
        expect(updateMock).not.toHaveBeenCalled();
      });

      it('still rejects undeclared nested keys, naming the flattened path', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeNestedRepo({ update: updateMock }),
        );
        const error = await failureOf(
          repo.update(
            PostId.make('post-1'),
            // @ts-expect-error nope is not a field of metaData
            { metaData: { nope: true } },
            { merge: true },
          ),
        );

        expect(error._tag).toBe('SchemaError');
        expect(String(error)).toContain('metaData.nope');
        expect(updateMock).not.toHaveBeenCalled();
      });

      it('requires complete nested values without merge', () => {
        const repo = Effect.runSync(makeNestedRepo({}));
        const write = repo.update(PostId.make('post-1'), {
          // @ts-expect-error tags is required when replacing the map
          metaData: { deleted: true },
        });
        expect(write).toBeDefined();
      });

      it('does not treat a scalar field as a map', () => {
        const repo = Effect.runSync(makeNestedRepo({}));
        const write = repo.update(PostId.make('post-1'), {
          // @ts-expect-error title is a string, not a map
          'title.length': 1,
        });
        expect(write).toBeDefined();
      });
    });

    // DateTimeUpdate's documented contract is "server timestamp on every
    // write". repo.update builds its request schema by wrapping every field
    // in Schema.optional, which drops an omitted key before the inner
    // ServerDateTimeSchema encoder can stamp it — so without the repository
    // re-stamping, repo.update(id, { title }) left updatedAt unchanged. These
    // pin the contract so a regression to that behaviour fails here first.
    describe('auto-stamps DateTimeUpdate fields', () => {
      const payloadOf = (mock: ReturnType<typeof vi.fn>) =>
        (mock.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];

      it('re-stamps an omitted DateTimeUpdate field on update', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeStampedRepo({ update: updateMock }),
        );
        await Effect.runPromise(
          repo.update(PostId.make('post-1'), { title: 'Updated' }),
        );

        expect(payloadOf(updateMock)).toEqual({
          title: 'Updated',
          updatedAt: expect.any(ServerTimestamp),
        });
      });

      it('re-stamps an omitted DateTimeUpdate field under merge', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeStampedRepo({ update: updateMock }),
        );
        await Effect.runPromise(
          repo.update(
            PostId.make('post-1'),
            { title: 'Updated' },
            { merge: true },
          ),
        );

        expect(payloadOf(updateMock)).toEqual({
          title: 'Updated',
          updatedAt: expect.any(ServerTimestamp),
        });
      });

      it('does not double-stamp when the caller passes updatedAt: undefined', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeStampedRepo({ update: updateMock }),
        );
        await Effect.runPromise(
          repo.update(PostId.make('post-1'), {
            title: 'Updated',
            updatedAt: undefined,
          }),
        );

        const payload = payloadOf(updateMock);
        expect(Object.keys(payload).sort()).toEqual(['title', 'updatedAt']);
        expect(payload.updatedAt).toBeInstanceOf(ServerTimestamp);
      });

      it('preserves an explicitly passed DateTime.Utc for updatedAt', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeStampedRepo({ update: updateMock }),
        );
        const when = DateTime.makeUnsafe(1_700_000_000_000);
        await Effect.runPromise(
          repo.update(PostId.make('post-1'), {
            title: 'Updated',
            updatedAt: when,
          }),
        );

        const { updatedAt } = payloadOf(updateMock) as { updatedAt: unknown };
        expect(updatedAt).toBeInstanceOf(Timestamp);
        expect((updatedAt as Timestamp).toMillis()).toBe(
          DateTime.toEpochMillis(when),
        );
      });

      it('stamps updatedAt even when no other field is given', async () => {
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeStampedRepo({ update: updateMock }),
        );
        await Effect.runPromise(repo.update(PostId.make('post-1'), {}));

        expect(payloadOf(updateMock)).toEqual({
          updatedAt: expect.any(ServerTimestamp),
        });
      });

      it('does not stamp fields the model does not auto-manage (WithServerTimestamp)', async () => {
        class WithStampModel extends Model.Class<WithStampModel>(
          'WithStampModel',
        )({
          id: Model.GeneratedByDb(PostId),
          title: Schema.String,
          lastSeenAt: FirestoreModel.WithServerTimestamp(
            FirestoreModel.DateTime,
          ),
        }) {}
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeRepository(WithStampModel, {
            collectionPath: 'posts',
            idField: 'id',
            spanPrefix: 'test',
          }).pipe(Effect.provide(makeLayer({ update: updateMock }))),
        );
        await Effect.runPromise(
          repo.update(PostId.make('post-1'), { title: 'Updated' }),
        );

        expect(payloadOf(updateMock)).toEqual({ title: 'Updated' });
        expect(payloadOf(updateMock)).not.toHaveProperty('lastSeenAt');
      });

      it('stamps every auto-managed field independently (DateTimeUpdate + ServerDateTime)', async () => {
        class MultiStampModel extends Model.Class<MultiStampModel>(
          'MultiStampModel',
        )({
          id: Model.GeneratedByDb(PostId),
          title: Schema.String,
          updatedAt: FirestoreModel.DateTimeUpdate,
          seenAt: FirestoreModel.ServerDateTime,
        }) {}
        const updateMock = vi.fn(() => Effect.succeed(undefined));
        const repo = await Effect.runPromise(
          makeRepository(MultiStampModel, {
            collectionPath: 'posts',
            idField: 'id',
            spanPrefix: 'test',
          }).pipe(Effect.provide(makeLayer({ update: updateMock }))),
        );
        await Effect.runPromise(
          repo.update(PostId.make('post-1'), { title: 'Updated' }),
        );

        const payload = payloadOf(updateMock);
        expect(payload.title).toBe('Updated');
        expect(payload.updatedAt).toBeInstanceOf(ServerTimestamp);
        expect(payload.seenAt).toBeInstanceOf(ServerTimestamp);
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

  describe('group', () => {
    class CommentModel extends Model.Class<CommentModel>('CommentModel')({
      id: Model.GeneratedByDb(PostId),
      path: Model.GeneratedByDb(Schema.String),
      body: Schema.String,
      likes: Schema.Number,
    }) {}

    const groupSnap = (
      path: string,
      data: Record<string, unknown>,
    ): Snapshot => [{ id: path.split('/').pop() as string, path }, data];

    const makeCommentRepo = (overrides: Partial<FirestoreServiceShape>) =>
      makeRepository(CommentModel, {
        collectionPath: 'posts/p1/comments',
        idField: 'id',
        pathField: 'path',
        spanPrefix: 'test',
      }).pipe(Effect.provide(makeLayer(overrides)));

    it('queries the collection group with the last path segment', async () => {
      const queryGroupMock = vi.fn(() =>
        Effect.succeed([
          groupSnap('posts/p1/comments/c1', { body: 'First', likes: 1 }),
          groupSnap('users/u1/comments/c2', { body: 'Second', likes: 2 }),
        ]),
      );
      const repo = await Effect.runPromise(
        makeCommentRepo({ queryGroup: queryGroupMock }),
      );
      const results = await Effect.runPromise(repo.group.query([]));

      expect(queryGroupMock).toHaveBeenCalledWith('comments', []);
      expect(results).toEqual([
        { id: 'c1', path: 'posts/p1/comments/c1', body: 'First', likes: 1 },
        { id: 'c2', path: 'users/u1/comments/c2', body: 'Second', likes: 2 },
      ]);
    });

    it('fills pathField on collection-scoped reads too', async () => {
      const queryMock = vi.fn(() =>
        Effect.succeed([
          groupSnap('posts/p1/comments/c1', { body: 'First', likes: 1 }),
        ]),
      );
      const repo = await Effect.runPromise(
        makeCommentRepo({ query: queryMock }),
      );
      const results = await Effect.runPromise(repo.query([]));

      expect(queryMock).toHaveBeenCalledWith('posts/p1/comments', []);
      expect(results[0]).toMatchObject({
        id: 'c1',
        path: 'posts/p1/comments/c1',
      });
    });

    it('streams through streamQueryGroup', async () => {
      const streamMock = vi.fn(() =>
        Stream.make([
          groupSnap('posts/p1/comments/c1', { body: 'First', likes: 1 }),
        ]),
      );
      const repo = await Effect.runPromise(
        makeCommentRepo({ streamQueryGroup: streamMock }),
      );
      const first = await Effect.runPromise(
        Stream.runHead(repo.group.getByQueryStream([])),
      );

      expect(streamMock).toHaveBeenCalledWith('comments', []);
      expect(Option.getOrThrow(Option.flatten(first))).toMatchObject({
        id: 'c1',
        path: 'posts/p1/comments/c1',
      });
    });

    it('rejects a non-string pathField at compile time', () => {
      makeRepository(CommentModel, {
        collectionPath: 'comments',
        idField: 'id',
        // @ts-expect-error likes is a number field
        pathField: 'likes',
        spanPrefix: 'test',
      });
    });

    it('dies on a collection path with an empty last segment', async () => {
      const exit = await Effect.runPromiseExit(
        makeRepository(CommentModel, {
          collectionPath: 'posts/p1/comments/',
          idField: 'id',
          spanPrefix: 'test',
        }).pipe(Effect.provide(makeLayer({}))),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasDies(exit.cause)).toBe(true);
      }
    });
  });
});
