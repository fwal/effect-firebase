import { describe, expect, it } from 'vitest';
import {
  DateTime,
  Effect,
  Fiber,
  Option,
  Schema,
  Stream,
} from 'effect';
import { Model } from 'effect/unstable/schema';
import {
  Firestore,
  FirestoreError,
  FirestoreSchema,
  FirestoreService,
  Query,
  Snapshot,
} from 'effect-firebase';
import { MockController } from './controller.js';
import { fixture, rawFixture } from './fixture.js';
import { layer } from './layer.js';
import * as MockState from './state.js';

const PostId = Schema.String.pipe(Schema.brand('PostId'));

class Post extends Model.Class<Post>('Post')({
  id: Model.GeneratedByDb(PostId),
  title: Schema.String,
  views: Schema.Number,
  createdAt: Firestore.DateTimeInsert,
}) {}

const postFixture = fixture(Post, {
  collectionPath: 'posts',
  idField: 'id',
  docs: [
    new Post({
      id: PostId.make('1'),
      title: 'Alpha',
      views: 10,
      createdAt: DateTime.makeUnsafe(1_000),
    }),
    new Post({
      id: PostId.make('2'),
      title: 'Beta',
      views: 30,
      createdAt: DateTime.makeUnsafe(2_000),
    }),
  ],
});

const run = <A, E>(
  effect: Effect.Effect<A, E, FirestoreService | MockController>,
  options?: Parameters<typeof layer>[0]
): Promise<A> =>
  Effect.runPromise(
    effect.pipe(Effect.provide(layer(options))) as Effect.Effect<A, E, never>
  );

/**
 * Poll until a collector array reaches the expected length, so stream
 * assertions don't race emissions.
 */
const awaitLength = (collected: ReadonlyArray<unknown>, length: number) =>
  Effect.gen(function* () {
    for (let i = 0; i < 200 && collected.length < length; i++) {
      yield* Effect.sleep('5 millis');
    }
    if (collected.length < length) {
      return yield* Effect.die(
        new Error(
          `Timed out waiting for ${length} emissions (got ${collected.length})`
        )
      );
    }
  });

describe('layer', () => {
  describe('CRUD', () => {
    it('adds, reads, updates and deletes documents', () =>
      run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;

          const { id, path } = yield* firestore.add('posts', {
            title: 'Hello',
            views: 1,
          });
          expect(path).toBe(`posts/${id}`);

          const created = yield* firestore.get(path);
          expect(Option.isSome(created)).toBe(true);
          const [ref, data] = (created as Option.Some<Snapshot>).value;
          expect(ref.id).toBe(id);
          expect(data['title']).toBe('Hello');

          yield* firestore.update(path, { views: 2 });
          const updated = yield* firestore.get(path);
          expect(
            (updated as Option.Some<Snapshot>).value[1]['views']
          ).toBe(2);

          yield* firestore.delete(path);
          const deleted = yield* firestore.get(path);
          expect(Option.isNone(deleted)).toBe(true);
        })
      ));

    it('materializes server timestamps on write', () =>
      run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          const { path } = yield* firestore.add('posts', {
            title: 'Hello',
            createdAt: new FirestoreSchema.ServerTimestamp(),
          });
          const created = yield* firestore.get(path);
          const data = (created as Option.Some<Snapshot>).value[1];
          expect(data['createdAt']).toBeInstanceOf(FirestoreSchema.Timestamp);
        })
      ));

    it('fails update on a missing document with not-found', async () => {
      const error = await run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          return yield* Effect.flip(
            firestore.update('posts/missing', { title: 'X' })
          );
        })
      );
      expect(error).toBeInstanceOf(FirestoreError);
      expect((error as FirestoreError).code).toBe('not-found');
    });

    it('deletes recursively including subcollections', () =>
      run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          yield* firestore.set('posts/1', { title: 'A' });
          yield* firestore.set('posts/1/comments/1', { body: 'Hi' });
          yield* firestore.deleteRecursive('posts/1');
          expect(Option.isNone(yield* firestore.get('posts/1'))).toBe(true);
          expect(
            Option.isNone(yield* firestore.get('posts/1/comments/1'))
          ).toBe(true);
        })
      ));

    it('rejects invalid paths', async () => {
      const error = await run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          return yield* Effect.flip(firestore.get('posts'));
        })
      );
      expect((error as FirestoreError).code).toBe('invalid-argument');
    });
  });

  describe('fixtures', () => {
    it('seeds schema-encoded model fixtures', () =>
      run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          const doc = yield* firestore.get('posts/1');
          const data = (doc as Option.Some<Snapshot>).value[1];
          expect(data['title']).toBe('Alpha');
          expect(data['createdAt']).toBeInstanceOf(FirestoreSchema.Timestamp);
          expect('id' in data).toBe(false);
        }),
        { fixtures: [postFixture] }
      ));

    it('seeds raw fixtures', () =>
      run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          const doc = yield* firestore.get('settings/general');
          expect(
            (doc as Option.Some<Snapshot>).value[1]['theme']
          ).toBe('dark');
        }),
        { fixtures: [rawFixture('settings', { general: { theme: 'dark' } })] }
      ));

    it('queries seeded fixtures with constraints', () =>
      run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          const results = yield* firestore.query('posts', [
            new Query.Where({ field: 'views', op: '>', value: 15 }),
          ]);
          expect(results.map(([ref]) => ref.id)).toEqual(['2']);
        }),
        { fixtures: [postFixture] }
      ));
  });

  describe('states', () => {
    it('fails reads and writes while a collection is erroring', async () => {
      const [readError, writeError] = await run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          const controller = yield* MockController;
          yield* controller.setState('posts', 'error');
          const read = yield* Effect.flip(firestore.get('posts/1'));
          const write = yield* Effect.flip(
            firestore.add('posts', { title: 'X' })
          );
          return [read, write] as const;
        }),
        { fixtures: [postFixture] }
      );
      expect((readError as FirestoreError).code).toBe('unavailable');
      expect((writeError as FirestoreError).code).toBe('unavailable');
    });

    it('supports custom error codes', async () => {
      const error = await run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          const controller = yield* MockController;
          yield* controller.setState(
            'posts',
            MockState.error('permission-denied')
          );
          return yield* Effect.flip(firestore.get('posts/1'));
        })
      );
      expect((error as FirestoreError).code).toBe('permission-denied');
    });

    it('resolves reads to nothing while a collection is empty', () =>
      run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          const controller = yield* MockController;
          yield* controller.setState('posts', 'empty');
          expect(Option.isNone(yield* firestore.get('posts/1'))).toBe(true);
          expect(yield* firestore.query('posts', [])).toEqual([]);
        }),
        { fixtures: [postFixture] }
      ));

    it('never resolves while a collection is loading', async () => {
      const result = await run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          const controller = yield* MockController;
          yield* controller.setState('posts', 'loading');
          return yield* Effect.timeoutOption(
            firestore.get('posts/1'),
            '50 millis'
          );
        }),
        { fixtures: [postFixture] }
      );
      expect(Option.isNone(result)).toBe(true);
    });

    it('applies the wildcard state to every collection', () =>
      run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          expect(yield* firestore.query('posts', [])).toEqual([]);
          expect(yield* firestore.query('authors', [])).toEqual([]);
        }),
        { fixtures: [postFixture], states: { [MockState.All]: 'empty' } }
      ));
  });

  describe('streams', () => {
    it('re-emits query results on writes and state toggles', () =>
      run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          const controller = yield* MockController;
          const emissions: Array<ReadonlyArray<Snapshot>> = [];

          const fiber = yield* Effect.forkChild(
            Stream.runForEach(firestore.streamQuery('posts', []), (snapshots) =>
              Effect.sync(() => {
                emissions.push(snapshots);
              })
            )
          );

          yield* awaitLength(emissions, 1);
          expect(emissions[0].length).toBe(2);

          // A write flows through the live stream.
          yield* firestore.add('posts', { title: 'Gamma', views: 5 });
          yield* awaitLength(emissions, 2);
          expect(emissions[1].length).toBe(3);

          // Toggling to empty and back re-emits without re-subscribing.
          yield* controller.setState('posts', 'empty');
          yield* awaitLength(emissions, 3);
          expect(emissions[2]).toEqual([]);

          yield* controller.setState('posts', 'data');
          yield* awaitLength(emissions, 4);
          expect(emissions[3].length).toBe(3);

          yield* Fiber.interrupt(fiber);
        }),
        { fixtures: [postFixture] }
      ));

    it('does not re-emit for unrelated collections', () =>
      run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          const emissions: Array<ReadonlyArray<Snapshot>> = [];

          const fiber = yield* Effect.forkChild(
            Stream.runForEach(firestore.streamQuery('posts', []), (snapshots) =>
              Effect.sync(() => {
                emissions.push(snapshots);
              })
            )
          );

          yield* awaitLength(emissions, 1);
          yield* firestore.set('authors/1', { name: 'Ada' });
          yield* Effect.sleep('30 millis');
          expect(emissions.length).toBe(1);

          yield* Fiber.interrupt(fiber);
        }),
        { fixtures: [postFixture] }
      ));

    it('fails live streams when a collection starts erroring', () =>
      run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          const controller = yield* MockController;
          const emissions: Array<ReadonlyArray<Snapshot>> = [];
          const failures: Array<FirestoreError> = [];

          const fiber = yield* Effect.forkChild(
            Stream.runForEach(firestore.streamQuery('posts', []), (snapshots) =>
              Effect.sync(() => {
                emissions.push(snapshots);
              })
            ).pipe(
              Effect.catch((error) =>
                Effect.sync(() => {
                  failures.push(error);
                })
              )
            )
          );

          yield* awaitLength(emissions, 1);
          yield* controller.setState('posts', 'error');
          yield* awaitLength(failures, 1);
          expect(failures[0].code).toBe('unavailable');

          yield* Fiber.interrupt(fiber);
        }),
        { fixtures: [postFixture] }
      ));

    it('streams a single document', () =>
      run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          const emissions: Array<Option.Option<Snapshot>> = [];

          const fiber = yield* Effect.forkChild(
            Stream.runForEach(firestore.streamDoc('posts/1'), (doc) =>
              Effect.sync(() => {
                emissions.push(doc);
              })
            )
          );

          yield* awaitLength(emissions, 1);
          expect(Option.isSome(emissions[0])).toBe(true);

          yield* firestore.update('posts/1', { views: 99 });
          yield* awaitLength(emissions, 2);
          expect(
            (emissions[1] as Option.Some<Snapshot>).value[1]['views']
          ).toBe(99);

          yield* firestore.delete('posts/1');
          yield* awaitLength(emissions, 3);
          expect(Option.isNone(emissions[2])).toBe(true);

          yield* Fiber.interrupt(fiber);
        }),
        { fixtures: [postFixture] }
      ));
  });

  describe('controller', () => {
    it('seeds additional fixtures at runtime', () =>
      run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          const controller = yield* MockController;
          yield* controller.seed(
            rawFixture('posts', { extra: { title: 'Extra', views: 0 } })
          );
          const results = yield* firestore.query('posts', []);
          expect(results.length).toBe(3);
        }),
        { fixtures: [postFixture] }
      ));

    it('resets to the initial fixtures and states', () =>
      run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          const controller = yield* MockController;

          yield* firestore.add('posts', { title: 'Temporary', views: 0 });
          yield* controller.setState('posts', 'empty');
          yield* controller.reset;

          const results = yield* firestore.query('posts', []);
          expect(results.length).toBe(2);
          expect(yield* controller.states).toEqual({});
        }),
        { fixtures: [postFixture] }
      ));

    it('simulates latency', () =>
      run(
        Effect.gen(function* () {
          const firestore = yield* FirestoreService;
          const controller = yield* MockController;
          yield* controller.setLatency('40 millis');
          const start = Date.now();
          yield* firestore.get('posts/1');
          expect(Date.now() - start).toBeGreaterThanOrEqual(30);
        }),
        { fixtures: [postFixture] }
      ));
  });

  describe('repository integration', () => {
    it('drives a real repository end to end', () =>
      run(
        Effect.gen(function* () {
          const repo = yield* Firestore.makeRepository(Post, {
            collectionPath: 'posts',
            idField: 'id',
            spanPrefix: 'test.PostRepository',
          });

          const existing = yield* repo.getById(PostId.make('1'));
          expect(Option.isSome(existing)).toBe(true);
          const post = (existing as Option.Some<Post>).value;
          expect(post.title).toBe('Alpha');
          expect(DateTime.toEpochMillis(post.createdAt)).toBe(1_000);

          // Server timestamps materialize and decode back into DateTime.
          const newId = yield* repo.add({
            title: 'Fresh',
            views: 0,
            createdAt: undefined,
          });
          const fresh = yield* repo.getById(newId);
          expect(Option.isSome(fresh)).toBe(true);
          expect(
            DateTime.toEpochMillis((fresh as Option.Some<Post>).value.createdAt)
          ).toBeGreaterThan(0);

          const popular = yield* repo.query([
            new Query.Where({ field: 'views', op: '>=', value: 10 }),
            new Query.OrderBy({ field: 'views', direction: 'desc' }),
          ]);
          expect(popular.map((p) => p.title)).toEqual(['Beta', 'Alpha']);
        }),
        { fixtures: [postFixture] }
      ));

    it('streams decoded models through a repository', () =>
      run(
        Effect.gen(function* () {
          const repo = yield* Firestore.makeRepository(Post, {
            collectionPath: 'posts',
            idField: 'id',
            spanPrefix: 'test.PostRepository',
          });
          const controller = yield* MockController;
          const emissions: Array<ReadonlyArray<Post>> = [];

          const fiber = yield* Effect.forkChild(
            Stream.runForEach(repo.queryStream([]), (posts) =>
              Effect.sync(() => {
                emissions.push(posts);
              })
            )
          );

          yield* awaitLength(emissions, 1);
          expect(emissions[0].map((p) => p.title)).toEqual(['Alpha', 'Beta']);

          yield* controller.setState('posts', 'empty');
          yield* awaitLength(emissions, 2);
          expect(emissions[1]).toEqual([]);

          yield* Fiber.interrupt(fiber);
        }),
        { fixtures: [postFixture] }
      ));
  });
});
