import { describe, expect, it } from 'vitest';
import { DateTime, Effect, Option, Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import { Firestore, Query } from 'effect-firebase';
import { fixture, type Fixture } from './fixture.js';
import { layer } from './layer.js';

const PostId = Schema.String.pipe(Schema.brand('PostId'));

class Post extends Model.Class<Post>('Post')({
  id: Model.GeneratedByDb(PostId),
  title: Schema.String,
  views: Schema.Number,
  createdAt: Firestore.DateTimeInsert,
  optional: Firestore.OptionalDeletable(Schema.String),
}) {}

const build = (target: Fixture) =>
  Effect.runPromise(target.build as Effect.Effect<Record<string, unknown>>);

const post = (id: string, views: number) =>
  new Post({
    id: PostId.make(id),
    title: `Post ${id}`,
    views,
    createdAt: DateTime.makeUnsafe(1_000 + views),
    optional: Option.none(),
  });

const posts = (options: { readonly docs: ReadonlyArray<Post> }) =>
  fixture(Post, {
    collectionPath: 'posts',
    idField: 'id',
    docs: options.docs,
  });

describe('fixture', () => {
  it('keys documents by their id field', async () => {
    const docs = await build(posts({ docs: [post('a', 1), post('b', 2)] }));
    expect(Object.keys(docs)).toEqual(['posts/a', 'posts/b']);
    // The id field is stripped from the stored data — it lives in the path.
    expect(docs['posts/a']).not.toHaveProperty('id');
  });

  it('rejects document IDs containing a path separator', async () => {
    await expect(
      build(posts({ docs: [post('child/item', 0)] })),
    ).rejects.toThrow(/must not contain '\/'/);
  });

  it('rejects invalid collection paths', async () => {
    await expect(
      build(
        fixture(Post, {
          collectionPath: 'posts/a',
          idField: 'id',
          docs: [post('x', 1)],
        }),
      ),
    ).rejects.toThrow(/Invalid collection path/);
  });

  it('rejects duplicate document IDs', async () => {
    await expect(
      build(posts({ docs: [post('same', 1), post('same', 2)] })),
    ).rejects.toThrow(/duplicate document ID 'same'/);
  });

  it('seeds a mock backend whose documents decode through a repository', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* Firestore.makeRepository(Post, {
          collectionPath: 'posts',
          idField: 'id',
          spanPrefix: 'test.PostRepository',
        });
        const found = yield* repo.query([
          new Query.OrderBy({ field: 'views', direction: 'asc' }),
        ]);
        expect(found.map((p) => p.id)).toEqual(['a', 'b', 'c']);
        for (const p of found) {
          expect(typeof p.title).toBe('string');
          expect(typeof p.views).toBe('number');
          expect(Option.isOption(p.optional)).toBe(true);
        }
      }).pipe(
        Effect.provide(
          layer({
            fixtures: [
              posts({ docs: [post('c', 3), post('a', 1), post('b', 2)] }),
            ],
          }),
        ),
      ) as Effect.Effect<void>,
    ));
});
