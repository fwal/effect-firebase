import { describe, expect, it } from 'vitest';
import { Effect, Option, Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import { Firestore, FirestoreSchema, FirestoreService } from 'effect-firebase';
import { MockController } from './controller.js';
import { layer } from './layer.js';

const TagId = Schema.String.pipe(Schema.brand('TagId'));
const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));
const RefId = Schema.String.pipe(Schema.brand('RefId'));

/**
 * `tags` is a `NumberFromString` array: app-domain `number`, DB-domain
 * `string`. `arrayUnion`/`arrayRemove` sentinels must encode their inner
 * values to strings before they reach the converter/mock storage, otherwise
 * the stored array mixes encoded strings (from prior plain writes) with raw
 * numbers (from the sentinel) and the next read throws a `SchemaError`.
 */
class TagModel extends Model.Class<TagModel>('TagModel')({
  id: Model.GeneratedByDb(TagId),
  tags: Firestore.Array(Schema.NumberFromString),
}) {
  static idField = 'id' as const;
}

/**
 * `authors` is a typed-reference array: app-domain branded id string,
 * DB-domain `FirestoreSchema.Reference` instance. The sentinel encode must
 * turn the branded id into a `Reference` so the converter/mock stores it in
 * the same shape the plain replace path produces.
 */
class RefModel extends Model.Class<RefModel>('RefModel')({
  id: Model.GeneratedByDb(RefId),
  authors: Firestore.WithArrayFields(
    Schema.Array(FirestoreSchema.ReferenceId(AuthorId, 'authors')),
  ),
}) {
  static idField = 'id' as const;
}

const run = <A, E>(
  effect: Effect.Effect<A, E, FirestoreService | MockController>,
): Promise<A> =>
  Effect.runPromise(
    effect.pipe(Effect.provide(layer({}))) as Effect.Effect<A, E, never>,
  );

const tagRepo = () =>
  Firestore.makeRepository(TagModel, {
    collectionPath: 'tags',
    idField: 'id',
    spanPrefix: 'test.TagRepository',
  });

const refRepo = () =>
  Firestore.makeRepository(RefModel, {
    collectionPath: 'refs',
    idField: 'id',
    spanPrefix: 'test.RefRepository',
  });

describe('array sentinel end-to-end (mock backend)', () => {
  describe('NumberFromString element', () => {
    it('arrayUnion stores encoded strings and reads back as numbers', async () => {
      const r = await run(
        Effect.gen(function* () {
          const repo = yield* tagRepo();
          yield* repo.set(TagId.make('p1'), { data: { tags: [1, 2] } });
          yield* repo.update(TagId.make('p1'), {
            tags: Firestore.arrayUnion([3]),
          });
          const docs = yield* (yield* MockController).docs;
          const stored = (docs as any)['tags/p1'].tags;
          const read = yield* repo.getById(TagId.make('p1'));
          return { stored, read };
        }),
      );
      // The encode runs through the element schema, so the sentinel stores
      // the same encoded string as the plain replace path does — no mixed
      // ['1','2',3] corruption.
      expect(r.stored).toEqual(['1', '2', '3']);
      expect(Option.isSome(r.read)).toBe(true);
      expect((r.read as Option.Some<any>).value.tags).toEqual([1, 2, 3]);
    });

    it('arrayRemove stores encoded strings and removes a matching encoded value', async () => {
      const r = await run(
        Effect.gen(function* () {
          const repo = yield* tagRepo();
          yield* repo.set(TagId.make('p1'), { data: { tags: [1, 2] } });
          yield* repo.update(TagId.make('p1'), {
            tags: Firestore.arrayRemove([1]),
          });
          const docs = yield* (yield* MockController).docs;
          const stored = (docs as any)['tags/p1'].tags;
          const read = yield* repo.getById(TagId.make('p1'));
          return { stored, read };
        }),
      );
      // Encoded '1' matches the stored '1', so it is removed.
      expect(r.stored).toEqual(['2']);
      expect(Option.isSome(r.read)).toBe(true);
      expect((r.read as Option.Some<any>).value.tags).toEqual([2]);
    });
  });

  describe('ReferenceId element', () => {
    it('arrayUnion stores Reference-shaped values and reads back as branded ids', async () => {
      const r = await run(
        Effect.gen(function* () {
          const repo = yield* refRepo();
          yield* repo.set(RefId.make('p1'), {
            data: { authors: [AuthorId.make('a1')] },
          });
          yield* repo.update(RefId.make('p1'), {
            authors: Firestore.arrayUnion([AuthorId.make('a2')]),
          });
          const docs = yield* (yield* MockController).docs;
          const stored = (docs as any)['refs/p1'].authors;
          const read = yield* repo.getById(RefId.make('p1'));
          return { stored, read };
        }),
      );
      expect(r.stored).toHaveLength(2);
      expect(r.stored[0]).toBeInstanceOf(FirestoreSchema.Reference);
      expect((r.stored[0] as FirestoreSchema.Reference).path).toBe(
        'authors/a1',
      );
      expect(r.stored[1]).toBeInstanceOf(FirestoreSchema.Reference);
      expect((r.stored[1] as FirestoreSchema.Reference).path).toBe(
        'authors/a2',
      );
      expect(Option.isSome(r.read)).toBe(true);
      expect((r.read as Option.Some<any>).value.authors).toEqual([
        AuthorId.make('a1'),
        AuthorId.make('a2'),
      ]);
    });

    it('arrayRemove removes a Reference-shaped matching value', async () => {
      const r = await run(
        Effect.gen(function* () {
          const repo = yield* refRepo();
          yield* repo.set(RefId.make('p1'), {
            data: { authors: [AuthorId.make('a1'), AuthorId.make('a2')] },
          });
          yield* repo.update(RefId.make('p1'), {
            authors: Firestore.arrayRemove([AuthorId.make('a1')]),
          });
          const docs = yield* (yield* MockController).docs;
          const stored = (docs as any)['refs/p1'].authors;
          const read = yield* repo.getById(RefId.make('p1'));
          return { stored, read };
        }),
      );
      expect(r.stored).toHaveLength(1);
      expect((r.stored[0] as FirestoreSchema.Reference).path).toBe(
        'authors/a2',
      );
      expect(Option.isSome(r.read)).toBe(true);
      expect((r.read as Option.Some<any>).value.authors).toEqual([
        AuthorId.make('a2'),
      ]);
    });
  });

  describe('identity-encoded element (Schema.String) regression', () => {
    class StringTagsModel extends Model.Class<StringTagsModel>(
      'StringTagsModel',
    )({
      id: Model.GeneratedByDb(TagId),
      tags: Firestore.Array(Schema.String),
    }) {
      static idField = 'id' as const;
    }

    const stringTagRepo = () =>
      Firestore.makeRepository(StringTagsModel, {
        collectionPath: 'stringtags',
        idField: 'id',
        spanPrefix: 'test.StringTagRepository',
      });

    it('arrayUnion still wires a String array through unchanged', async () => {
      const r = await run(
        Effect.gen(function* () {
          const repo = yield* stringTagRepo();
          yield* repo.set(TagId.make('p1'), { data: { tags: ['a'] } });
          yield* repo.update(TagId.make('p1'), {
            tags: Firestore.arrayUnion(['b']),
          });
          const docs = yield* (yield* MockController).docs;
          const stored = (docs as any)['stringtags/p1'].tags;
          const read = yield* repo.getById(TagId.make('p1'));
          return { stored, read };
        }),
      );
      expect(r.stored).toEqual(['a', 'b']);
      expect(Option.isSome(r.read)).toBe(true);
      expect((r.read as Option.Some<any>).value.tags).toEqual(['a', 'b']);
    });
  });
});
