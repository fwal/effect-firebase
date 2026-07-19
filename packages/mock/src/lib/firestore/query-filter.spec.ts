import { describe, expect, it } from 'vitest';
import { Query, Snapshot } from 'effect-firebase';
import { applyConstraints } from './query-filter.js';

const snap = (id: string, data: Record<string, unknown>): Snapshot => [
  { id, path: `posts/${id}` },
  data,
];

const posts: ReadonlyArray<Snapshot> = [
  snap('1', { title: 'Alpha', views: 10, tags: ['news'], status: 'draft' }),
  snap('2', { title: 'Beta', views: 30, tags: ['tech', 'news'], status: 'published' }),
  snap('3', { title: 'Gamma', views: 20, tags: ['tech'], status: 'published' }),
  snap('4', { title: 'Delta', views: 40, status: 'archived' }),
];

const ids = (results: ReadonlyArray<Snapshot>) => results.map(([ref]) => ref.id);

describe('applyConstraints', () => {
  it('returns everything ordered by document ID without constraints', () => {
    expect(ids(applyConstraints(posts, []))).toEqual(['1', '2', '3', '4']);
  });

  it('filters with equality and inequality', () => {
    expect(
      ids(
        applyConstraints(posts, [
          new Query.Where({ field: 'status', op: '==', value: 'published' }),
        ])
      )
    ).toEqual(['2', '3']);
    expect(
      ids(
        applyConstraints(posts, [
          new Query.Where({ field: 'status', op: '!=', value: 'published' }),
        ])
      )
    ).toEqual(['1', '4']);
  });

  it('filters with range operators', () => {
    expect(
      ids(
        applyConstraints(posts, [
          new Query.Where({ field: 'views', op: '>', value: 15 }),
          new Query.Where({ field: 'views', op: '<=', value: 30 }),
        ])
      )
    ).toEqual(['2', '3']);
  });

  it('range operators never match values of a different type', () => {
    expect(
      ids(
        applyConstraints(posts, [
          new Query.Where({ field: 'title', op: '>', value: 5 }),
        ])
      )
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
        ])
      )
    ).toEqual(['1', '4']);
    expect(
      ids(
        applyConstraints(posts, [
          new Query.Where({
            field: 'status',
            op: 'not-in',
            value: ['draft', 'archived'],
          }),
        ])
      )
    ).toEqual(['2', '3']);
  });

  it('filters with array-contains and array-contains-any', () => {
    expect(
      ids(
        applyConstraints(posts, [
          new Query.Where({ field: 'tags', op: 'array-contains', value: 'tech' }),
        ])
      )
    ).toEqual(['2', '3']);
    expect(
      ids(
        applyConstraints(posts, [
          new Query.Where({
            field: 'tags',
            op: 'array-contains-any',
            value: ['news', 'tech'],
          }),
        ])
      )
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
        ])
      )
    ).toEqual(['1', '4']);
  });

  it('orders ascending and descending', () => {
    expect(
      ids(
        applyConstraints(posts, [
          new Query.OrderBy({ field: 'views', direction: 'asc' }),
        ])
      )
    ).toEqual(['1', '3', '2', '4']);
    expect(
      ids(
        applyConstraints(posts, [
          new Query.OrderBy({ field: 'views', direction: 'desc' }),
        ])
      )
    ).toEqual(['4', '2', '3', '1']);
  });

  it('applies limit and limitToLast', () => {
    const ordered = [new Query.OrderBy({ field: 'views', direction: 'asc' })];
    expect(
      ids(applyConstraints(posts, [...ordered, new Query.Limit({ count: 2 })]))
    ).toEqual(['1', '3']);
    expect(
      ids(
        applyConstraints(posts, [
          ...ordered,
          new Query.LimitToLast({ count: 2 }),
        ])
      )
    ).toEqual(['2', '4']);
  });

  it('applies cursors relative to orderBy values', () => {
    const ordered = [new Query.OrderBy({ field: 'views', direction: 'asc' })];
    expect(
      ids(
        applyConstraints(posts, [
          ...ordered,
          new Query.StartAfter({ values: [20] }),
        ])
      )
    ).toEqual(['2', '4']);
    expect(
      ids(
        applyConstraints(posts, [
          ...ordered,
          new Query.StartAt({ values: [20] }),
          new Query.EndBefore({ values: [40] }),
        ])
      )
    ).toEqual(['3', '2']);
  });
});
