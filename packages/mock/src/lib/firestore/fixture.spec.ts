import { describe, expect, it } from 'vitest';
import { Effect, Option, Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import { Firestore, Query } from 'effect-firebase';
import { generatedFixture } from './fixture.js';
import { layer } from './layer.js';

const PostId = Schema.String.pipe(Schema.brand('PostId'));

class Post extends Model.Class<Post>('Post')({
  id: Model.GeneratedByDb(PostId),
  title: Schema.String,
  views: Schema.Number,
  createdAt: Firestore.DateTimeInsert,
  optional: Firestore.OptionalDeletable(Schema.String),
}) {}

const build = (fixture: ReturnType<typeof generatedFixture>) =>
  Effect.runPromise(fixture.build as Effect.Effect<Record<string, unknown>>);

describe('generatedFixture', () => {
  it('generates the requested number of schema-valid documents', async () => {
    const docs = await build(
      generatedFixture(Post, {
        collectionPath: 'posts',
        idField: 'id',
        count: 25,
      }),
    );
    const paths = Object.keys(docs);
    expect(paths.length).toBe(25);
    expect(paths[0]).toBe('posts/generated-0001');
    expect(paths.every((path) => /^posts\/generated-\d{4}$/.test(path))).toBe(
      true,
    );
  });

  it('is deterministic for the same seed and diverges for another', async () => {
    const options = {
      collectionPath: 'posts',
      idField: 'id',
      count: 5,
    } as const;
    const a = await build(generatedFixture(Post, options));
    const b = await build(generatedFixture(Post, options));
    const c = await build(generatedFixture(Post, { ...options, seed: 2 }));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('generates dates within the range a Firestore Timestamp can store', async () => {
    const docs = await build(
      generatedFixture(Post, {
        collectionPath: 'posts',
        idField: 'id',
        count: 50,
      }),
    );
    const min = Date.parse('0001-01-01T00:00:00Z');
    const max = Date.parse('9999-12-31T23:59:59.999Z');
    for (const data of Object.values(docs)) {
      const createdAt = (data as Record<string, { toMillis(): number }>)[
        'createdAt'
      ];
      const millis = createdAt.toMillis();
      expect(millis).toBeGreaterThanOrEqual(min);
      expect(millis).toBeLessThanOrEqual(max);
    }
  });

  it('honors toArbitrary annotations on model fields', async () => {
    const titles = ['Getting started', 'Release notes', 'Roadmap'];

    class Curated extends Model.Class<Curated>('Curated')({
      id: Model.GeneratedByDb(PostId),
      title: Schema.String.annotate({
        toArbitrary: () => (fc) => fc.constantFrom(...titles),
      }),
    }) {}

    const docs = await build(
      generatedFixture(Curated, {
        collectionPath: 'posts',
        idField: 'id',
        count: 10,
      }),
    );
    for (const data of Object.values(docs)) {
      expect(titles).toContain((data as Record<string, unknown>)['title']);
    }
  });

  it('supports custom document IDs', async () => {
    const docs = await build(
      generatedFixture(Post, {
        collectionPath: 'posts',
        idField: 'id',
        count: 2,
        id: (index) => `custom-${index}`,
      }),
    );
    expect(Object.keys(docs)).toEqual(['posts/custom-0', 'posts/custom-1']);
  });

  it('seeds a mock backend whose documents decode through a repository', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* Firestore.makeRepository(Post, {
          collectionPath: 'posts',
          idField: 'id',
          spanPrefix: 'test.PostRepository',
        });
        const posts = yield* repo.query([
          new Query.OrderBy({ field: 'views', direction: 'asc' }),
        ]);
        expect(posts.length).toBe(10);
        for (const post of posts) {
          expect(typeof post.title).toBe('string');
          expect(typeof post.views).toBe('number');
          expect(Option.isOption(post.optional)).toBe(true);
        }
      }).pipe(
        Effect.provide(
          layer({
            fixtures: [
              generatedFixture(Post, {
                collectionPath: 'posts',
                idField: 'id',
                count: 10,
              }),
            ],
          }),
        ),
      ) as Effect.Effect<void>,
    ));
});
