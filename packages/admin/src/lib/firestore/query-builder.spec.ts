import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Filter, type Firestore } from 'firebase-admin/firestore';
import { Query } from 'effect-firebase';
import { buildCollectionGroupQuery, buildQuery } from './query-builder.js';

// The builder accepts untyped `QueryConstraint[]`; the `Query.where`/
// `Query.and` constructors are type-checked against a model (S is inferred
// from the contextual `Query<S>` type the way `repo.query(...)` supplies it).
class TestModel extends Schema.Class<TestModel>('TestModel')({
  status: Schema.Literals(['draft', 'published']),
  category: Schema.String,
  createdAt: Schema.Number,
}) {}

const post = (query: Query.Query<typeof TestModel>) => query;

type Op = readonly [name: string, ...args: unknown[]];

const makeChain = (ops: Op[]) => {
  const chain = {
    where: (...args: unknown[]) => {
      ops.push(['where', ...args]);
      return chain;
    },
    orderBy: (...args: unknown[]) => {
      ops.push(['orderBy', ...args]);
      return chain;
    },
    limit: (n: unknown) => {
      ops.push(['limit', n]);
      return chain;
    },
    limitToLast: (n: unknown) => {
      ops.push(['limitToLast', n]);
      return chain;
    },
    startAt: (...args: unknown[]) => {
      ops.push(['startAt', ...args]);
      return chain;
    },
    startAfter: (...args: unknown[]) => {
      ops.push(['startAfter', ...args]);
      return chain;
    },
    endAt: (...args: unknown[]) => {
      ops.push(['endAt', ...args]);
      return chain;
    },
    endBefore: (...args: unknown[]) => {
      ops.push(['endBefore', ...args]);
      return chain;
    },
  };
  return chain;
};

const makeDb = (ops: Op[]): Firestore =>
  ({
    collection: (path: string) => {
      ops.push(['__collection__', path]);
      return makeChain(ops);
    },
    collectionGroup: (id: string) => {
      ops.push(['__collectionGroup__', id]);
      return makeChain(ops);
    },
  }) as unknown as Firestore;

const or = post(
  Query.or(
    Query.where('category', '==', 'news'),
    Query.where('category', '==', 'tech'),
  ),
);

describe('buildQuery (admin query-builder)', () => {
  describe('Query.and mixing a nested or with non-filter constraints', () => {
    it('does not throw when orderBy and limit are mixed with a nested or', () => {
      const ops: Op[] = [];
      const db = makeDb(ops);
      const constraints = post(
        Query.and(
          Query.where('status', '==', 'published'),
          or,
          Query.orderBy('category', 'desc'),
          Query.limit(20),
        ),
      );
      expect(() => buildQuery(db, 'posts', constraints)).not.toThrow();
    });

    it('applies the composite filter first, then orderBy and limit as siblings', () => {
      const ops: Op[] = [];
      const db = makeDb(ops);
      const constraints = post(
        Query.and(
          Query.where('status', '==', 'published'),
          or,
          Query.orderBy('category', 'desc'),
          Query.limit(20),
        ),
      );
      buildQuery(db, 'posts', constraints);

      const queryOps = ops.filter((op) => op[0] !== '__collection__');
      // Composite filter applied first, then orderBy, then limit.
      expect(queryOps.map((op) => op[0])).toEqual([
        'where',
        'orderBy',
        'limit',
      ]);
      // The composite filter is a real admin Filter (Filter.and(Filter.where, Filter.or)).
      expect(queryOps[0][1]).toBeInstanceOf(Filter);
    });

    it('keeps cursor constraints as top-level siblings, preserving order', () => {
      const ops: Op[] = [];
      const db = makeDb(ops);
      const constraints = post(
        Query.and(
          Query.where('status', '==', 'published'),
          or,
          Query.orderBy('category', 'desc'),
          Query.startAfter('news'),
          Query.limit(20),
        ),
      );
      expect(() => buildQuery(db, 'posts', constraints)).not.toThrow();
      const queryOps = ops.filter((op) => op[0] !== '__collection__');
      expect(queryOps.map((op) => op[0])).toEqual([
        'where',
        'orderBy',
        'startAfter',
        'limit',
      ]);
    });

    it('builds a collection group query with the same mixed composition', () => {
      const ops: Op[] = [];
      const db = makeDb(ops);
      const constraints = post(
        Query.and(
          Query.where('status', '==', 'published'),
          or,
          Query.orderBy('category', 'desc'),
          Query.limit(20),
        ),
      );
      expect(() =>
        buildCollectionGroupQuery(db, 'posts', constraints),
      ).not.toThrow();
      const queryOps = ops.filter((op) => op[0] !== '__collectionGroup__');
      expect(queryOps.map((op) => op[0])).toEqual([
        'where',
        'orderBy',
        'limit',
      ]);
    });
  });

  describe('controls (no regression)', () => {
    it('Query.and(where, or) with only filters does not throw', () => {
      const ops: Op[] = [];
      const db = makeDb(ops);
      const constraints = post(
        Query.and(Query.where('status', '==', 'published'), or),
      );
      expect(() => buildQuery(db, 'posts', constraints)).not.toThrow();
      const queryOps = ops.filter((op) => op[0] !== '__collection__');
      expect(queryOps.map((op) => op[0])).toEqual(['where']);
    });

    it('Query.and(where, orderBy) on the flatten path applies orderBy directly', () => {
      const ops: Op[] = [];
      const db = makeDb(ops);
      const constraints = post(
        Query.and(
          Query.where('status', '==', 'published'),
          Query.orderBy('createdAt', 'desc'),
        ),
      );
      expect(() => buildQuery(db, 'posts', constraints)).not.toThrow();
      const queryOps = ops.filter((op) => op[0] !== '__collection__');
      // No composite -> two separate field ops, no Filter wrapping.
      expect(queryOps.map((op) => op[0])).toEqual(['where', 'orderBy']);
      expect(queryOps[0][1]).not.toBeInstanceOf(Filter);
    });

    it('a plain where constraint builds without throwing', () => {
      const ops: Op[] = [];
      const db = makeDb(ops);
      const constraints = post(Query.where('status', '==', 'published'));
      expect(() => buildQuery(db, 'posts', constraints)).not.toThrow();
      const queryOps = ops.filter((op) => op[0] !== '__collection__');
      expect(queryOps.map((op) => op[0])).toEqual(['where']);
    });
  });
});
