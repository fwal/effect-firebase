import { describe, expect, it } from '@effect/vitest';
import { pipe, Schema } from 'effect';
import { Query, Snapshot } from 'effect-firebase';
import { applyConstraints, validateGroupCursors } from './query-filter.js';

const snap = (id: string, data: Record<string, unknown>): Snapshot => [
  { id, path: `posts/${id}` },
  data,
];

const posts: ReadonlyArray<Snapshot> = [
  snap('1', { title: 'Alpha', views: 10, tags: ['news'], status: 'draft' }),
  snap('2', {
    title: 'Beta',
    views: 30,
    tags: ['tech', 'news'],
    status: 'published',
  }),
  snap('3', { title: 'Gamma', views: 20, tags: ['tech'], status: 'published' }),
  snap('4', { title: 'Delta', views: 40, status: 'archived' }),
];

const ids = (results: ReadonlyArray<Snapshot>) =>
  results.map(([ref]) => ref.id);

describe('applyConstraints', () => {
  it('returns everything ordered by document ID without constraints', () => {
    expect(ids(applyConstraints(posts, []))).toEqual(['1', '2', '3', '4']);
  });

  it('filters with equality and inequality', () => {
    expect(
      ids(
        applyConstraints(posts, [
          new Query.Where({ field: 'status', op: '==', value: 'published' }),
        ]),
      ),
    ).toEqual(['2', '3']);
    expect(
      ids(
        applyConstraints(posts, [
          new Query.Where({ field: 'status', op: '!=', value: 'published' }),
        ]),
      ),
    ).toEqual(['1', '4']);
  });

  describe('not-equal null and missing field semantics', () => {
    // Fixtures mixing present, explicit-null, and missing `status` values:
    // the combination produced by `Firestore.Optional` writing `Option.none()`
    // as a literal `null` field.
    const docs: ReadonlyArray<Snapshot> = [
      snap('a', { status: 'active' }),
      snap('b', { status: 'archived' }),
      snap('c', { status: null }),
      snap('d', { title: 'no status field' }),
    ];

    it('excludes explicit-null and missing field values from != clauses', () => {
      // Real Firestore `!= 'active'` returns docs where status exists, is not
      // null, and is not 'active' -> only [b]. The mock previously returned
      // [b, c] because it only guarded against missing fields.
      expect(
        ids(
          applyConstraints(docs, [
            new Query.Where({ field: 'status', op: '!=', value: 'active' }),
          ]),
        ),
      ).toEqual(['b']);
    });

    it('excludes the matching non-null value from != clauses', () => {
      expect(
        ids(
          applyConstraints(docs, [
            new Query.Where({ field: 'status', op: '!=', value: 'archived' }),
          ]),
        ),
      ).toEqual(['a']);
    });

    it('!= null returns the present non-null values, like Firestore', () => {
      // A null *field* never matches `!=` (so [c] is out and [d] is out), but a
      // present non-null value is "not equal to null", so it is returned.
      // Cross-checked manually against the Firestore emulator: `!= null` is
      // NOT the empty set.
      expect(
        ids(
          applyConstraints(docs, [
            new Query.Where({ field: 'status', op: '!=', value: null }),
          ]),
        ),
      ).toEqual(['a', 'b']);
    });

    it('still includes explicit-null fields in == null queries', () => {
      // Regression guard for the adjacent == branch: == null matches docs
      // whose field is explicitly null, but not docs where it is missing.
      expect(
        ids(
          applyConstraints(docs, [
            new Query.Where({ field: 'status', op: '==', value: null }),
          ]),
        ),
      ).toEqual(['c']);
    });

    it('still excludes explicit-null fields from == with a non-null value', () => {
      // Regression guard: == 'active' matches only [a], not [c] (null).
      expect(
        ids(
          applyConstraints(docs, [
            new Query.Where({ field: 'status', op: '==', value: 'active' }),
          ]),
        ),
      ).toEqual(['a']);
    });
  });

  describe('not-in null and missing field semantics', () => {
    // The same null/missing fixtures as the `!=` suite above: the shape
    // produced by `Firestore.Optional` / `OptionalNull` writing `Option.none()`
    // as a literal `null` field. Firestore `not-in` returns documents where
    // the field exists, is not null, and is not in the list; a null comparison
    // value makes the whole query match no documents. Both rows were confirmed
    // against the Firestore emulator.
    const docs: ReadonlyArray<Snapshot> = [
      snap('a', { status: 'active' }),
      snap('b', { status: 'archived' }),
      snap('c', { status: null }),
      snap('d', { title: 'no status field' }),
    ];

    it('excludes explicit-null and missing field values from not-in clauses', () => {
      // Real Firestore `not-in ['active']` returns docs where status exists,
      // is not null, and is not 'active' -> only [b]. The mock previously
      // returned [b, c] because it only guarded against missing fields.
      expect(
        ids(
          applyConstraints(docs, [
            new Query.Where({
              field: 'status',
              op: 'not-in',
              value: ['active'],
            }),
          ]),
        ),
      ).toEqual(['b']);
    });

    it('null in the comparison list matches NO documents', () => {
      // Firestore: "A not-in query with null as one of the comparison values
      // does not match any documents."
      expect(
        ids(
          applyConstraints(docs, [
            new Query.Where({
              field: 'status',
              op: 'not-in',
              value: ['active', null],
            }),
          ]),
        ),
      ).toEqual([]);
    });

    it('agrees with != over the null/missing field shape', () => {
      // `not-in [x]` and `!= x` share Firestore's null/missing exclusion, so
      // they return the same docs over the (non-NaN) null/missing fixture.
      for (const value of ['active', 'archived']) {
        expect(
          ids(
            applyConstraints(docs, [
              new Query.Where({
                field: 'status',
                op: 'not-in',
                value: [value],
              }),
            ]),
          ),
        ).toEqual(
          ids(
            applyConstraints(docs, [
              new Query.Where({ field: 'status', op: '!=', value }),
            ]),
          ),
        );
      }
    });
  });

  it('filters with range operators', () => {
    expect(
      ids(
        applyConstraints(posts, [
          new Query.Where({ field: 'views', op: '>', value: 15 }),
          new Query.Where({ field: 'views', op: '<=', value: 30 }),
        ]),
      ),
    ).toEqual(['2', '3']);
  });

  it('range operators never match values of a different type', () => {
    expect(
      ids(
        applyConstraints(posts, [
          new Query.Where({ field: 'title', op: '>', value: 5 }),
        ]),
      ),
    ).toEqual([]);
  });

  it('filters with in and not-in', () => {
    expect(
      ids(
        applyConstraints(posts, [
          new Query.Where({
            field: 'status',
            op: 'in',
            value: ['draft', 'archived'],
          }),
        ]),
      ),
    ).toEqual(['1', '4']);
    expect(
      ids(
        applyConstraints(posts, [
          new Query.Where({
            field: 'status',
            op: 'not-in',
            value: ['draft', 'archived'],
          }),
        ]),
      ),
    ).toEqual(['2', '3']);
  });

  it('filters with array-contains and array-contains-any', () => {
    expect(
      ids(
        applyConstraints(posts, [
          new Query.Where({
            field: 'tags',
            op: 'array-contains',
            value: 'tech',
          }),
        ]),
      ),
    ).toEqual(['2', '3']);
    expect(
      ids(
        applyConstraints(posts, [
          new Query.Where({
            field: 'tags',
            op: 'array-contains-any',
            value: ['news', 'tech'],
          }),
        ]),
      ),
    ).toEqual(['1', '2', '3']);
  });

  it('supports or filters', () => {
    expect(
      ids(
        applyConstraints(posts, [
          new Query.Or({
            constraints: [
              new Query.Where({ field: 'status', op: '==', value: 'draft' }),
              new Query.Where({ field: 'views', op: '>=', value: 40 }),
            ],
          }),
        ]),
      ),
    ).toEqual(['1', '4']);
  });

  it('supports and filters', () => {
    expect(
      ids(
        applyConstraints(posts, [
          new Query.And({
            constraints: [
              new Query.Where({
                field: 'status',
                op: '==',
                value: 'published',
              }),
              new Query.Where({ field: 'views', op: '>', value: 25 }),
            ],
          }),
        ]),
      ),
    ).toEqual(['2']);
  });

  it('orders ascending and descending', () => {
    expect(
      ids(
        applyConstraints(posts, [
          new Query.OrderBy({ field: 'views', direction: 'asc' }),
        ]),
      ),
    ).toEqual(['1', '3', '2', '4']);
    expect(
      ids(
        applyConstraints(posts, [
          new Query.OrderBy({ field: 'views', direction: 'desc' }),
        ]),
      ),
    ).toEqual(['4', '2', '3', '1']);
  });

  it('excludes documents missing an orderBy field, like Firestore', () => {
    // Post '4' has no 'tags' field.
    expect(
      ids(
        applyConstraints(posts, [
          new Query.OrderBy({ field: 'tags', direction: 'asc' }),
        ]),
      ),
    ).toEqual(['1', '3', '2']);
  });

  it('resolves the __name__ sentinel to the document ID', () => {
    // No document is excluded (every document has an ID), ordering follows
    // the IDs, and __name__ cursor values compare against IDs.
    expect(
      ids(applyConstraints(posts, Query.orderByDocumentId('desc'))),
    ).toEqual(['4', '3', '2', '1']);
    expect(
      ids(
        applyConstraints(posts, [
          new Query.OrderBy({ field: 'status', direction: 'asc' }),
          ...Query.orderByDocumentId('asc'),
          new Query.StartAfter({ values: ['published', '2'] }),
        ]),
      ),
    ).toEqual(['3']);
  });

  it('applies limit and limitToLast', () => {
    const ordered = [new Query.OrderBy({ field: 'views', direction: 'asc' })];
    expect(
      ids(applyConstraints(posts, [...ordered, new Query.Limit({ count: 2 })])),
    ).toEqual(['1', '3']);
    expect(
      ids(
        applyConstraints(posts, [
          ...ordered,
          new Query.LimitToLast({ count: 2 }),
        ]),
      ),
    ).toEqual(['2', '4']);
  });

  it('prefers limitToLast when combined with limit', () => {
    const ordered = [new Query.OrderBy({ field: 'views', direction: 'asc' })];
    expect(
      ids(
        applyConstraints(posts, [
          ...ordered,
          new Query.Limit({ count: 3 }),
          new Query.LimitToLast({ count: 2 }),
        ]),
      ),
    ).toEqual(['2', '4']);
  });

  it('orders and pages a collection group by full path, not bare ID', () => {
    // Same IDs under different parents: Firestore compares the full
    // reference, so `posts/p1/comments/c1` sorts before `users/u1/comments/c1`
    // and neither is dropped or treated as a duplicate.
    const group: ReadonlyArray<Snapshot> = [
      [{ id: 'c1', path: 'users/u1/comments/c1' }, { likes: 1 }],
      [{ id: 'c1', path: 'posts/p1/comments/c1' }, { likes: 1 }],
      [{ id: 'c2', path: 'posts/p1/comments/c2' }, { likes: 1 }],
    ];
    const paths = (results: ReadonlyArray<Snapshot>) =>
      results.map(([ref]) => ref.path);

    expect(paths(applyConstraints(group, []))).toEqual([
      'posts/p1/comments/c1',
      'posts/p1/comments/c2',
      'users/u1/comments/c1',
    ]);
    expect(
      paths(applyConstraints(group, Query.orderByDocumentId('desc'))),
    ).toEqual([
      'users/u1/comments/c1',
      'posts/p1/comments/c2',
      'posts/p1/comments/c1',
    ]);
    // A group cursor on __name__ is a full document path.
    expect(
      paths(
        applyConstraints(group, [
          ...Query.orderByDocumentId('asc'),
          new Query.StartAfter({ values: ['posts/p1/comments/c1'] }),
        ]),
      ),
    ).toEqual(['posts/p1/comments/c2', 'users/u1/comments/c1']);
    // The implicit tiebreaker pages past equal field values the same way.
    expect(
      paths(
        applyConstraints(group, [
          new Query.OrderBy({ field: 'likes', direction: 'asc' }),
          new Query.StartAfter({ values: [1, 'posts/p1/comments/c2'] }),
        ]),
      ),
    ).toEqual(['users/u1/comments/c1']);
  });

  it('rejects bare-ID name cursors for collection group queries', () => {
    const named = Query.orderByDocumentId('asc');
    expect(
      validateGroupCursors([
        ...named,
        new Query.StartAfter({ values: ['c1'] }),
      ]),
    ).toMatch(/full document path/);
    // The implicit tiebreaker position is checked too.
    expect(
      validateGroupCursors([
        new Query.OrderBy({ field: 'likes', direction: 'asc' }),
        new Query.StartAfter({ values: [1, 'c1'] }),
      ]),
    ).toMatch(/full document path/);
    // Odd segment counts name a collection, not a document.
    expect(
      validateGroupCursors([
        ...named,
        new Query.EndAt({ values: ['posts/p1/comments'] }),
      ]),
    ).toMatch(/full document path/);
    expect(
      validateGroupCursors([
        ...named,
        new Query.StartAfter({ values: ['posts/p1/comments/c1'] }),
      ]),
    ).toBeUndefined();
    // Field-only cursors are unaffected.
    expect(
      validateGroupCursors([
        new Query.OrderBy({ field: 'likes', direction: 'asc' }),
        new Query.StartAfter({ values: [1] }),
      ]),
    ).toBeUndefined();
  });

  it('rejects cursors with more values than the query orders by', () => {
    // One value per orderBy plus the implicit document-name tiebreaker is the
    // most Firestore accepts; more than that is an invalid cursor, not a
    // crash.
    expect(
      validateGroupCursors([
        new Query.OrderBy({ field: 'likes', direction: 'asc' }),
        new Query.StartAfter({
          values: [1, 'posts/p1/comments/c1', 'extra'],
        }),
      ]),
    ).toMatch(/Too many cursor values/);
    expect(
      validateGroupCursors([new Query.StartAfter({ values: ['a', 'b'] })]),
    ).toMatch(/Too many cursor values/);
    // An explicit __name__ ordering is the document-name position, so no
    // implicit one is appended and a second value is already too many.
    expect(
      validateGroupCursors([
        ...Query.orderByDocumentId('asc'),
        new Query.StartAfter({
          values: ['posts/p1/comments/c1', 'posts/p1/comments/c2'],
        }),
      ]),
    ).toMatch(/Too many cursor values/);
    expect(
      validateGroupCursors([
        new Query.OrderBy({ field: 'likes', direction: 'asc' }),
        ...Query.orderByDocumentId('asc'),
        new Query.StartAfter({ values: [1, 'posts/p1/comments/c1'] }),
      ]),
    ).toBeUndefined();
  });

  it('applies cursors relative to orderBy values', () => {
    const ordered = [new Query.OrderBy({ field: 'views', direction: 'asc' })];
    expect(
      ids(
        applyConstraints(posts, [
          ...ordered,
          new Query.StartAfter({ values: [20] }),
        ]),
      ),
    ).toEqual(['2', '4']);
    expect(
      ids(
        applyConstraints(posts, [
          ...ordered,
          new Query.StartAt({ values: [20] }),
          new Query.EndBefore({ values: [40] }),
        ]),
      ),
    ).toEqual(['3', '2']);
  });

  describe('Query.and with a nested or and non-filter constraints', () => {
    // `Query.where`/`Query.and` are type-checked against a model (S is
    // inferred from the contextual `Query<S>` type the way `repo.query(...)`
    // supplies it). The `posts` fixtures have `status`, `tags` and `views`.
    class TestModel extends Schema.Class<TestModel>('TestModel')({
      status: Schema.String,
      tags: Schema.Array(Schema.String),
      views: Schema.Number,
    }) {}
    const post = (query: Query.Query<typeof TestModel>) => query;

    // Published posts with a news-or-tech tag: posts '2' (views 30) and '3'
    // (views 20). The or(...) forces Query.and onto its wrap path; the
    // orderBy/limit must remain top-level siblings so the mock still sorts
    // and limits, matching the equivalent pipeable add* form.
    const mixedAndOr = () =>
      post(
        Query.and(
          Query.where('status', '==', 'published'),
          Query.or(
            Query.where('tags', 'array-contains', 'news'),
            Query.where('tags', 'array-contains', 'tech'),
          ),
          Query.orderBy('views', 'desc'),
          Query.limit(1),
        ),
      );

    const pipeableForm = () =>
      pipe(
        post(
          Query.and(
            Query.where('status', '==', 'published'),
            Query.or(
              Query.where('tags', 'array-contains', 'news'),
              Query.where('tags', 'array-contains', 'tech'),
            ),
          ),
        ),
        Query.addOrderBy<typeof TestModel, 'views'>('views', 'desc'),
        Query.addLimit(1),
      );

    it('filters, sorts and limits (non-filters kept as top-level siblings)', () => {
      expect(ids(applyConstraints(posts, mixedAndOr()))).toEqual(['2']);
    });

    it('matches the equivalent pipeable add* form, shape and results', () => {
      const wrapped = mixedAndOr();
      const piped = pipeableForm();
      // Same constraint-shape: [And([Where, Or]), OrderBy, Limit].
      expect(wrapped.map((c) => c._tag)).toEqual(['And', 'OrderBy', 'Limit']);
      expect(piped.map((c) => c._tag)).toEqual(['And', 'OrderBy', 'Limit']);
      expect(ids(applyConstraints(posts, wrapped))).toEqual(
        ids(applyConstraints(posts, piped)),
      );
    });

    it('Query.and(where, orderBy, limit) on the flatten path also sorts and limits', () => {
      const flat = post(
        Query.and(
          Query.where('status', '==', 'published'),
          Query.orderBy('views', 'desc'),
          Query.limit(1),
        ),
      );
      expect(flat.map((c) => c._tag)).toEqual(['Where', 'OrderBy', 'Limit']);
      expect(ids(applyConstraints(posts, flat))).toEqual(['2']);
    });

    it('keeps cursor constraints as top-level siblings alongside a nested or', () => {
      const withCursor = post(
        Query.and(
          Query.where('status', '==', 'published'),
          Query.or(
            Query.where('tags', 'array-contains', 'news'),
            Query.where('tags', 'array-contains', 'tech'),
          ),
          Query.orderBy('views', 'asc'),
          Query.startAfter(10),
          Query.limit(1),
        ),
      );
      // [And([Where, Or]), OrderBy, StartAfter, Limit] — cursor honored.
      expect(withCursor.map((c) => c._tag)).toEqual([
        'And',
        'OrderBy',
        'StartAfter',
        'Limit',
      ]);
      // views asc, startAfter(10): post 3 (views 20) and post 2 (views 30);
      // limit 1 -> ['3'].
      expect(ids(applyConstraints(posts, withCursor))).toEqual(['3']);
    });
  });

  describe('NaN field values', () => {
    // Firestore stores NaN, normalizes it, and places it in a total order
    // below -Infinity (so orderBy lists it first ascending, last descending).
    // For FILTERS, Firestore excludes a NaN field value from range scans and
    // `in`, but always includes it in `not-in`; `==`/`!=` use equality, where
    // NaN is equal only to NaN. IDs are assigned in views-asc order so the
    // mock's implicit document-name ordering matches Firestore's
    // inequality-field ordering for the same result sets.
    // Verified against the Firestore emulator — see T9 in the test plan.
    const nanPosts: ReadonlyArray<Snapshot> = [
      snap('1', { views: Number.NaN }),
      snap('2', { views: -Infinity }),
      snap('3', { views: 0 }),
      snap('4', { views: 5 }),
      snap('5', { views: Infinity }),
    ];

    it('matches NaN with == only via NaN, and with != for any non-NaN', () => {
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.Where({ field: 'views', op: '==', value: 5 }),
          ]),
        ),
      ).toEqual(['4']);
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.Where({ field: 'views', op: '==', value: Number.NaN }),
          ]),
        ),
      ).toEqual(['1']);
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.Where({ field: 'views', op: '!=', value: 5 }),
          ]),
        ),
      ).toEqual(['1', '2', '3', '5']);
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.Where({ field: 'views', op: '!=', value: Number.NaN }),
          ]),
        ),
      ).toEqual(['2', '3', '4', '5']);
    });

    it('excludes NaN from every range filter, against any operand', () => {
      // NaN is never matched by <, <=, >, >= — even though NaN < -Infinity in
      // Firestore's total order, range scans skip NaN field values entirely.
      for (const operand of [5, -Infinity, Infinity]) {
        expect(
          ids(
            applyConstraints(nanPosts, [
              new Query.Where({ field: 'views', op: '<', value: operand }),
            ]),
          ),
        ).not.toContain('1');
        expect(
          ids(
            applyConstraints(nanPosts, [
              new Query.Where({ field: 'views', op: '<=', value: operand }),
            ]),
          ),
        ).not.toContain('1');
        expect(
          ids(
            applyConstraints(nanPosts, [
              new Query.Where({ field: 'views', op: '>', value: operand }),
            ]),
          ),
        ).not.toContain('1');
        expect(
          ids(
            applyConstraints(nanPosts, [
              new Query.Where({ field: 'views', op: '>=', value: operand }),
            ]),
          ),
        ).not.toContain('1');
      }
      // Concrete results for representative operands, pinning the full
      // result set (not just NaN exclusion) against the Firestore emulator.
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.Where({ field: 'views', op: '<', value: 5 }),
          ]),
        ),
      ).toEqual(['2', '3']);
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.Where({ field: 'views', op: '<=', value: -Infinity }),
          ]),
        ),
      ).toEqual(['2']);
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.Where({ field: 'views', op: '>=', value: -Infinity }),
          ]),
        ),
      ).toEqual(['2', '3', '4', '5']);
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.Where({ field: 'views', op: '>=', value: Infinity }),
          ]),
        ),
      ).toEqual(['5']);
    });

    it('excludes NaN from in, and always includes NaN in not-in', () => {
      // `in` never matches a NaN field value, even when NaN is a candidate.
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.Where({ field: 'views', op: 'in', value: [5] }),
          ]),
        ),
      ).toEqual(['4']);
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.Where({
              field: 'views',
              op: 'in',
              value: [Number.NaN],
            }),
          ]),
        ),
      ).toEqual([]);
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.Where({
              field: 'views',
              op: 'in',
              value: [5, Number.NaN],
            }),
          ]),
        ),
      ).toEqual(['4']);
      // `not-in` always includes a NaN field value, regardless of candidates.
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.Where({ field: 'views', op: 'not-in', value: [5] }),
          ]),
        ),
      ).toEqual(['1', '2', '3', '5']);
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.Where({
              field: 'views',
              op: 'not-in',
              value: [Number.NaN],
            }),
          ]),
        ),
      ).toEqual(['1', '2', '3', '4', '5']);
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.Where({
              field: 'views',
              op: 'not-in',
              value: [5, Number.NaN],
            }),
          ]),
        ),
      ).toEqual(['1', '2', '3', '5']);
    });

    it('null in a not-in list dominates the NaN-always-includes rule', () => {
      // A null comparison value makes `not-in` match no documents, overriding
      // the NaN-always-includes rule, so even a NaN field value is excluded.
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.Where({ field: 'views', op: 'not-in', value: [null] }),
          ]),
        ),
      ).toEqual([]);
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.Where({
              field: 'views',
              op: 'not-in',
              value: [5, null],
            }),
          ]),
        ),
      ).toEqual([]);
    });

    it('orders NaN first ascending and last descending', () => {
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.OrderBy({ field: 'views', direction: 'asc' }),
          ]),
        ),
      ).toEqual(['1', '2', '3', '4', '5']);
      expect(
        ids(
          applyConstraints(nanPosts, [
            new Query.OrderBy({ field: 'views', direction: 'desc' }),
          ]),
        ),
      ).toEqual(['5', '4', '3', '2', '1']);
    });
  });
});
