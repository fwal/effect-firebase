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
});
