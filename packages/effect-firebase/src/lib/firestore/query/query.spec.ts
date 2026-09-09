import { pipe } from 'effect';
import { describe, expect, it } from 'vitest';
import { Limit, OrderBy, StartAfter } from './constraints.js';
import * as Query from './query.js';

describe('Query', () => {
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
