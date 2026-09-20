import { Schema } from 'effect';
import { beforeEach, describe, expect, it } from '@effect/vitest';
import { vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import { Query } from 'effect-firebase';

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

const h = vi.hoisted(() => {
  const calls: Record<
    'and' | 'or' | 'where' | 'orderBy' | 'limit' | 'limitToLast' | 'query',
    Op[]
  > = {
    and: [],
    or: [],
    where: [],
    orderBy: [],
    limit: [],
    limitToLast: [],
    query: [],
  };
  const reset = () => {
    for (const key of Object.keys(calls) as (keyof typeof calls)[]) {
      calls[key] = [];
    }
  };
  return { calls, reset };
});

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  const track =
    (name: keyof typeof h.calls, fn: (...args: never[]) => unknown) =>
    (...args: never[]) => {
      h.calls[name].push([name, ...args] as Op);
      return fn(...args);
    };
  return {
    ...actual,
    collection: (_db: unknown, path: string) => ({ path }),
    collectionGroup: (_db: unknown, id: string) => ({ path: `group:${id}` }),
    query: (ref: unknown, ...rest: unknown[]) => {
      h.calls.query.push(['query', ref, ...rest] as Op);
      return ref;
    },
    and: track('and', actual.and),
    or: track('or', actual.or),
    where: track('where', actual.where),
    orderBy: track('orderBy', actual.orderBy),
    limit: track('limit', actual.limit),
    limitToLast: track('limitToLast', actual.limitToLast),
  };
});

import { buildCollectionGroupQuery, buildQuery } from './query-builder.js';

const db = {} as Firestore;

const or = post(
  Query.or(
    Query.where('category', '==', 'news'),
    Query.where('category', '==', 'tech'),
  ),
);

describe('buildQuery (client query-builder)', () => {
  beforeEach(() => h.reset());

  describe('Query.and mixing a nested or with non-filter constraints', () => {
    it('does not throw when orderBy and limit are mixed with a nested or', () => {
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

    it('routes only the filter constraints through and(), keeping orderBy/limit as siblings', () => {
      const constraints = post(
        Query.and(
          Query.where('status', '==', 'published'),
          or,
          Query.orderBy('category', 'desc'),
          Query.limit(20),
        ),
      );
      buildQuery(db, 'posts', constraints);

      // Exactly one and() composite, holding the two filter children.
      expect(h.calls.and).toHaveLength(1);
      expect(h.calls.and[0].slice(1)).toHaveLength(2);
      // orderBy/limit are top-level siblings, not passed to and().
      expect(h.calls.orderBy).toEqual([['orderBy', 'category', 'desc']]);
      expect(h.calls.limit).toEqual([['limit', 20]]);
    });

    it('keeps cursor constraints as top-level siblings, preserving order', () => {
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
      expect(h.calls.and).toHaveLength(1);
      expect(h.calls.and[0].slice(1)).toHaveLength(2);
      expect(h.calls.orderBy).toEqual([['orderBy', 'category', 'desc']]);
      expect(h.calls.limit).toEqual([['limit', 20]]);
    });

    it('builds a collection group query with the same mixed composition', () => {
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
      expect(h.calls.and).toHaveLength(1);
    });
  });

  describe('controls (no regression)', () => {
    it('Query.and(where, or) with only filters does not throw', () => {
      const constraints = post(
        Query.and(Query.where('status', '==', 'published'), or),
      );
      expect(() => buildQuery(db, 'posts', constraints)).not.toThrow();
      expect(h.calls.and).toHaveLength(1);
      expect(h.calls.orderBy).toHaveLength(0);
      expect(h.calls.limit).toHaveLength(0);
    });

    it('Query.and(where, orderBy) on the flatten path does not wrap in and()', () => {
      const constraints = post(
        Query.and(
          Query.where('status', '==', 'published'),
          Query.orderBy('createdAt', 'desc'),
        ),
      );
      expect(() => buildQuery(db, 'posts', constraints)).not.toThrow();
      // No nested composite -> no and() composite synthesized.
      expect(h.calls.and).toHaveLength(0);
      expect(h.calls.orderBy).toEqual([['orderBy', 'createdAt', 'desc']]);
    });

    it('a plain where constraint builds without throwing', () => {
      const constraints = post(Query.where('status', '==', 'published'));
      expect(() => buildQuery(db, 'posts', constraints)).not.toThrow();
      expect(h.calls.where).toEqual([['where', 'status', '==', 'published']]);
    });

    it('top-level spread of [where, or, orderBy, limit] does not throw the library converter', () => {
      const constraints = [
        ...post(Query.where('status', '==', 'published')),
        ...or,
        ...post(Query.orderBy('category', 'desc')),
        ...post(Query.limit(20)),
      ];
      expect(() => buildQuery(db, 'posts', constraints)).not.toThrow();
      // The composite is a top-level or() sibling, not wrapped in and().
      expect(h.calls.or).toHaveLength(1);
      expect(h.calls.orderBy).toEqual([['orderBy', 'category', 'desc']]);
      expect(h.calls.limit).toEqual([['limit', 20]]);
    });
  });
});
