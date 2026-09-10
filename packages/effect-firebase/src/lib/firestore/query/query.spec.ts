import { DateTime, Option, Schema, pipe } from 'effect';
import { Model } from 'effect/unstable/schema';
import { describe, expect, it } from 'vitest';
import * as FirestoreModel from '../model/datetime.js';
import { OptionalDeletable } from '../model/optional.js';
import { TimestampDateTimeUtc } from '../schema/timestamp.js';
import { Limit, OrderBy, StartAfter } from './constraints.js';
import * as Query from './query.js';

class PostModel extends Model.Class<PostModel>('PostModel')({
  id: Schema.String,
  status: Schema.Literals(['draft', 'published']),
  metaData: Schema.Struct({
    type: Schema.String,
    counts: Schema.Struct({ likes: Schema.Number }),
  }),
  tags: Schema.Array(Schema.String),
  createdAt: FirestoreModel.DateTimeInsert,
  profile: OptionalDeletable(
    Schema.Struct({ lastSeenAt: TimestampDateTimeUtc }),
  ),
  counters: Schema.Record(Schema.String, Schema.Number),
}) {}

describe('Query', () => {
  describe('nested field paths (#18)', () => {
    // Mirrors how `repo.query(...)` supplies the model: S is inferred from
    // the contextual `Query<S>` type, not from the arguments.
    const post = (query: Query.Query<typeof PostModel>) => query;
    type P = typeof PostModel;

    it('accepts dotted paths into nested maps and types the value', () => {
      const query = pipe(
        post(Query.where('metaData.type', '==', 'post')),
        Query.addWhere<P, 'metaData.counts.likes'>(
          'metaData.counts.likes',
          '>=',
          10,
        ),
        Query.addWhere<P, 'profile.lastSeenAt'>(
          'profile.lastSeenAt',
          '<',
          DateTime.makeUnsafe(0),
        ),
        Query.addWhere<P, 'counters.visits'>('counters.visits', '>', 1),
        Query.addOrderBy<P, 'metaData.counts.likes'>(
          'metaData.counts.likes',
          'desc',
        ),
      );

      expect(query.map((c) => (c as { field: string }).field)).toEqual([
        'metaData.type',
        'metaData.counts.likes',
        'profile.lastSeenAt',
        'counters.visits',
        'metaData.counts.likes',
      ]);
    });

    it('still accepts top-level fields with their own value types', () => {
      const queries = [
        post(Query.where('status', '==', 'published')),
        post(Query.where('profile', '==', Option.none())),
        post(Query.orderBy('createdAt', 'desc')),
      ];
      expect(queries).toHaveLength(3);
    });

    // One statement per case: inside a single array literal TypeScript lets
    // sibling elements influence inference and masks some of these errors.
    // prettier-ignore
    it('rejects unknown paths, paths into leaves, and mistyped values', () => {
      // @ts-expect-error nope is not a field of metaData
      const unknownPath = post(Query.where('metaData.nope', '==', 'x'));
      // @ts-expect-error arrays are leaves
      const intoArray = post(Query.where('tags.0', '==', 'x'));
      // @ts-expect-error DateTime is a leaf
      const intoDateTime = post(Query.where('createdAt.epochMillis', '==', 0));
      // Value typing is exact when K is fixed. Under contextual inference K
      // widens to the whole key union (pre-existing), so values are only
      // checked against the union of all field types there.
      // @ts-expect-error likes is a number
      const wrongLeafType = Query.where<P, 'metaData.counts.likes'>('metaData.counts.likes', '==', 'ten');
      // @ts-expect-error status is a literal union
      const wrongLiteral = Query.where<P, 'status'>('status', '==', 'archived');
      expect([unknownPath, intoArray, intoDateTime, wrongLeafType, wrongLiteral]).toHaveLength(5);
    });
  });

  describe('orderByDocumentId', () => {
    it('emits an OrderBy on the __name__ sentinel field path', () => {
      const [constraint] = Query.orderByDocumentId();

      expect(constraint).toBeInstanceOf(OrderBy);
      expect(constraint).toMatchObject({
        field: Query.documentIdFieldPath,
        direction: 'asc',
      });
    });

    it('supports descending direction', () => {
      const [constraint] = Query.orderByDocumentId('desc');

      expect(constraint).toMatchObject({
        field: '__name__',
        direction: 'desc',
      });
    });
  });

  describe('addOrderByDocumentId', () => {
    it('appends after existing constraints for cursor tiebreaking', () => {
      const query = pipe(
        Query.orderBy('createdAt', 'desc'),
        Query.addOrderByDocumentId('desc'),
        Query.addStartAfter('ts-value', 'doc-id'),
        Query.addLimit(10),
      );

      expect(query).toHaveLength(4);
      expect(query[0]).toMatchObject({ field: 'createdAt' });
      expect(query[1]).toMatchObject({
        field: '__name__',
        direction: 'desc',
      });
      expect(query[2]).toBeInstanceOf(StartAfter);
      expect(query[2]).toMatchObject({ values: ['ts-value', 'doc-id'] });
      expect(query[3]).toBeInstanceOf(Limit);
    });
  });
});
