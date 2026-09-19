import { describe, expect, it } from 'vitest';
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
