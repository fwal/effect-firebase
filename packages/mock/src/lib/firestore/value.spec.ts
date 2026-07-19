import { describe, expect, it } from 'vitest';
import { Firestore, FirestoreSchema } from 'effect-firebase';
import {
  applyMerge,
  applySet,
  applyUpdate,
  compare,
  equals,
  fieldValue,
} from './value.js';

const now = FirestoreSchema.Timestamp.fromMillis(1_000_000);

describe('compare', () => {
  it('orders numbers naturally', () => {
    expect(compare(1, 2)).toBeLessThan(0);
    expect(compare(2, 1)).toBeGreaterThan(0);
    expect(compare(1, 1)).toBe(0);
  });

  it('orders strings lexicographically', () => {
    expect(compare('a', 'b')).toBeLessThan(0);
    expect(compare('b', 'a')).toBeGreaterThan(0);
  });

  it('orders timestamps by instant', () => {
    const earlier = FirestoreSchema.Timestamp.fromMillis(1_000);
    const later = FirestoreSchema.Timestamp.fromMillis(2_000);
    expect(compare(earlier, later)).toBeLessThan(0);
    expect(compare(later, earlier)).toBeGreaterThan(0);
  });

  it('orders mixed types by Firestore type rank', () => {
    // null < boolean < number < timestamp < string
    expect(compare(null, true)).toBeLessThan(0);
    expect(compare(true, 1)).toBeLessThan(0);
    expect(compare(999, FirestoreSchema.Timestamp.fromMillis(0))).toBeLessThan(
      0
    );
    expect(
      compare(FirestoreSchema.Timestamp.fromMillis(0), 'a')
    ).toBeLessThan(0);
  });

  it('orders arrays elementwise, then by length', () => {
    expect(compare([1, 2], [1, 3])).toBeLessThan(0);
    expect(compare([1, 2], [1, 2, 0])).toBeLessThan(0);
    expect(compare([1, 2], [1, 2])).toBe(0);
  });
});

describe('equals', () => {
  it('compares nested structures', () => {
    expect(
      equals(
        { a: [1, { b: 'x' }], t: FirestoreSchema.Timestamp.fromMillis(5) },
        { a: [1, { b: 'x' }], t: FirestoreSchema.Timestamp.fromMillis(5) }
      )
    ).toBe(true);
    expect(equals({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('fieldValue', () => {
  it('resolves dot-separated paths', () => {
    expect(fieldValue({ a: { b: { c: 1 } } }, 'a.b.c')).toBe(1);
    expect(fieldValue({ a: 1 }, 'a.b')).toBeUndefined();
    expect(fieldValue({}, 'missing')).toBeUndefined();
  });
});

describe('applySet', () => {
  it('materializes server timestamps', () => {
    const result = applySet(
      { createdAt: new FirestoreSchema.ServerTimestamp(), title: 'Hi' },
      now
    );
    expect(result['createdAt']).toBe(now);
    expect(result['title']).toBe('Hi');
  });

  it('drops delete sentinels', () => {
    const result = applySet({ gone: Firestore.delete(), kept: 1 }, now);
    expect('gone' in result).toBe(false);
    expect(result['kept']).toBe(1);
  });
});

describe('applyMerge', () => {
  it('deep merges nested records', () => {
    const result = applyMerge(
      { nested: { a: 1, b: 2 }, top: 'x' },
      { nested: { b: 3 } },
      now
    );
    expect(result).toEqual({ nested: { a: 1, b: 3 }, top: 'x' });
  });

  it('removes fields via delete sentinel', () => {
    const result = applyMerge({ a: 1, b: 2 }, { b: Firestore.delete() }, now);
    expect(result).toEqual({ a: 1 });
  });
});

describe('applyUpdate', () => {
  it('sets values at dot-separated paths', () => {
    const result = applyUpdate(
      { nested: { a: 1 }, top: 'x' },
      { 'nested.b': 2 },
      now
    );
    expect(result).toEqual({ nested: { a: 1, b: 2 }, top: 'x' });
  });

  it('applies arrayUnion without duplicates', () => {
    const result = applyUpdate(
      { tags: ['a', 'b'] },
      { tags: Firestore.arrayUnion(['b', 'c']) },
      now
    );
    expect(result['tags']).toEqual(['a', 'b', 'c']);
  });

  it('applies arrayRemove', () => {
    const result = applyUpdate(
      { tags: ['a', 'b', 'c'] },
      { tags: Firestore.arrayRemove(['b']) },
      now
    );
    expect(result['tags']).toEqual(['a', 'c']);
  });

  it('materializes server timestamps in updates', () => {
    const result = applyUpdate(
      { title: 'Hi' },
      { updatedAt: new FirestoreSchema.ServerTimestamp() },
      now
    );
    expect(result['updatedAt']).toBe(now);
  });
});
