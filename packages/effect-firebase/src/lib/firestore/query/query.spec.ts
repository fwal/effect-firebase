import { DateTime, Option, Schema, pipe } from 'effect';
import { Model } from 'effect/unstable/schema';
import { describe, expect, it } from '@effect/vitest';
import * as FirestoreModel from '../model/datetime.js';
import { OptionalDeletable } from '../model/optional.js';
import { TimestampDateTimeUtc } from '../schema/timestamp.js';
import {
  And,
  Limit,
  LimitToLast,
  OrderBy,
  Or,
  StartAfter,
  Where,
} from './constraints.js';
import * as Query from './query.js';

class Inner extends Schema.Class<Inner>('Inner')({ x: Schema.Number }) {}

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
  klass: Inner,
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
        post(Query.where('klass.x', '==', 1)),
        post(Query.where('profile', '==', Option.none())),
        post(Query.orderBy('createdAt', 'desc')),
      ];
      expect(queries).toHaveLength(4);
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
        Query.orderBy<typeof PostModel>('createdAt', 'desc'),
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

  describe('and/or composite combinators', () => {
    // Mirrors how `repo.query(...)` supplies the model: S is inferred from the
    // contextual `Query<S>` type, not from the arguments (see "nested field
    // paths (#18)" above). PostModel has `status`, `createdAt` and a string
    // `metaData.type`, so those field names type-check against the model.
    const post = (query: Query.Query<typeof PostModel>) => query;
    const where = post(Query.where('status', '==', 'published'));
    const orderBy = post(Query.orderBy('createdAt', 'desc'));
    const limit = post(Query.limit(20));
    const or = post(
      Query.or(
        Query.where('metaData.type', '==', 'news'),
        Query.where('metaData.type', '==', 'tech'),
      ),
    );

    describe('and — flatten path (no nested composite)', () => {
      it('returns the constraints flat without wrapping', () => {
        const result = Query.and(where, orderBy, limit);
        expect(result).toHaveLength(3);
        expect(result[0]).toBeInstanceOf(Where);
        expect(result[1]).toBeInstanceOf(OrderBy);
        expect(result[2]).toBeInstanceOf(Limit);
        // No And node is synthesized.
        expect(result.some((c) => c._tag === 'And')).toBe(false);
      });

      it('returns a single constraint flat', () => {
        const result = Query.and(where);
        expect(result).toEqual(where);
      });

      it('returns an empty array when given no constraints', () => {
        const result = Query.and();
        expect(result).toEqual([]);
      });
    });

    describe('and — wrap path (nested composite present)', () => {
      it('keeps only filter constraints inside the And and returns non-filters as top-level siblings', () => {
        const result = Query.and(where, or, orderBy, limit);

        // Top-level: [And, OrderBy, Limit]
        expect(result).toHaveLength(3);
        expect(result[0]).toBeInstanceOf(And);
        expect(result[1]).toBeInstanceOf(OrderBy);
        expect(result[2]).toBeInstanceOf(Limit);

        // The And composite contains only the filter constraints, in order.
        const andNode = result[0] as And;
        expect(andNode.constraints).toHaveLength(2);
        expect(andNode.constraints[0]).toBeInstanceOf(Where);
        expect(andNode.constraints[1]).toBeInstanceOf(Or);

        // Non-filter values are preserved on the siblings.
        expect(result[1]).toMatchObject({
          field: 'createdAt',
          direction: 'desc',
        });
        expect(result[2]).toMatchObject({ count: 20 });
      });

      it('wraps only filters when no non-filter constraints are present', () => {
        const result = Query.and(where, or);
        expect(result).toHaveLength(1);
        expect(result[0]).toBeInstanceOf(And);
        const andNode = result[0] as And;
        expect(andNode.constraints).toHaveLength(2);
        expect(andNode.constraints[0]).toBeInstanceOf(Where);
        expect(andNode.constraints[1]).toBeInstanceOf(Or);
      });

      it('preserves the relative order of non-filter siblings including cursors', () => {
        const startAfter = post(Query.startAfter('news'));
        const result = Query.and(where, or, orderBy, startAfter, limit);

        // Top-level: [And, OrderBy, StartAfter, Limit]
        expect(result).toHaveLength(4);
        expect(result[0]).toBeInstanceOf(And);
        expect(result[1]).toBeInstanceOf(OrderBy);
        expect(result[2]).toBeInstanceOf(StartAfter);
        expect(result[3]).toBeInstanceOf(Limit);

        const andNode = result[0] as And;
        expect(andNode.constraints).toHaveLength(2);
        // Cursors stay out of the composite.
        expect(andNode.constraints.some((c) => c._tag === 'StartAfter')).toBe(
          false,
        );
      });

      it('wraps composite-only input without non-filter siblings', () => {
        const result = Query.and(or);
        expect(result).toHaveLength(1);
        expect(result[0]).toBeInstanceOf(And);
        const andNode = result[0] as And;
        expect(andNode.constraints).toHaveLength(1);
        expect(andNode.constraints[0]).toBeInstanceOf(Or);
      });

      it('keeps limitToLast as a top-level sibling, not inside And', () => {
        const limitToLast = post(Query.limitToLast(5));
        const result = Query.and(where, or, orderBy, limitToLast);
        expect(result).toHaveLength(3);
        expect(result[0]).toBeInstanceOf(And);
        expect(result[1]).toBeInstanceOf(OrderBy);
        const ltl = result[2];
        expect(ltl).toBeInstanceOf(LimitToLast);
        expect(ltl).toMatchObject({ count: 5 });
        const andNode = result[0] as And;
        expect(andNode.constraints).toHaveLength(2);
      });

      it('keeps all cursor constraints (StartAt/StartAfter/EndAt/EndBefore) as siblings', () => {
        const startAt = post(Query.startAt('a'));
        const endAt = post(Query.endAt('z'));
        const result = Query.and(where, or, orderBy, startAt, endAt, limit);
        expect(result).toHaveLength(5);
        expect(result[0]).toBeInstanceOf(And);
        expect(result[1]).toBeInstanceOf(OrderBy);
        expect(result[2]).toMatchObject({ _tag: 'StartAt' });
        expect(result[3]).toMatchObject({ _tag: 'EndAt' });
        expect(result[4]).toBeInstanceOf(Limit);
        const andNode = result[0] as And;
        expect(andNode.constraints).toHaveLength(2);
      });
    });

    describe('or', () => {
      it('wraps all children in an Or composite', () => {
        const result = post(
          Query.or(
            Query.where('metaData.type', '==', 'news'),
            Query.where('metaData.type', '==', 'tech'),
          ),
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toBeInstanceOf(Or);
        const orNode = result[0] as Or;
        expect(orNode.constraints).toHaveLength(2);
        expect(orNode.constraints[0]).toBeInstanceOf(Where);
        expect(orNode.constraints[1]).toBeInstanceOf(Where);
      });
    });
  });
});
