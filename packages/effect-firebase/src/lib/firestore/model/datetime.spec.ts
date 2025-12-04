import { DateTime as EffectDateTime, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { DateTime, DateTimeInsert, DateTimeUpdate } from './datetime.js';
import { Class, Generated } from './core.js';

describe('Model.DateTime', () => {
  const PostId = Schema.String.pipe(Schema.brand('PostId'));

  class TestModel extends Class<TestModel>('TestModel')({
    id: Generated(PostId),
    createdAt: DateTime,
  }) {}

  describe('get variant', () => {
    it('should decode Timestamp to DateTime.Utc', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({
        id: 'post-1',
        createdAt: { seconds: 1705315800, nanoseconds: 123000000 },
      });

      expect(EffectDateTime.isDateTime(result.createdAt)).toBe(true);
      expect(result.createdAt.epochMillis).toBe(1705315800123);
    });

    it('should encode DateTime.Utc to Timestamp', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({
          id: 'post-1' as typeof PostId.Type,
          createdAt: EffectDateTime.unsafeMake(1705315800123),
        })
      );

      expect(result.createdAt).toEqual({
        seconds: 1705315800,
        nanoseconds: 123000000,
      });
    });
  });

  describe('add variant', () => {
    it('should decode Timestamp to DateTime.Utc', () => {
      const decode = Schema.decodeUnknownSync(TestModel.add);
      const result = decode({
        createdAt: { seconds: 1705315800, nanoseconds: 0 },
      });

      expect(EffectDateTime.isDateTime(result.createdAt)).toBe(true);
    });

    it('should encode DateTime.Utc to Timestamp', () => {
      const encode = Schema.encodeSync(TestModel.add);
      const result = encode({
        createdAt: EffectDateTime.unsafeMake(1705315800000),
      });

      expect(result.createdAt).toEqual({
        seconds: 1705315800,
        nanoseconds: 0,
      });
    });
  });

  describe('json variant', () => {
    it('should decode ISO string to DateTime.Utc', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({
        id: 'post-1',
        createdAt: '2024-01-15T10:30:00.123Z',
      });

      expect(EffectDateTime.isDateTime(result.createdAt)).toBe(true);
    });

    it('should encode DateTime.Utc to ISO string', () => {
      const encode = Schema.encodeSync(TestModel.json);
      const dt = EffectDateTime.unsafeMake(1705315800123);
      const result = encode({
        id: 'post-1',
        createdAt: dt,
      });

      expect(typeof result.createdAt).toBe('string');
      expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});

describe('Model.DateTimeInsert', () => {
  const PostId = Schema.String.pipe(Schema.brand('PostId'));

  class TestModel extends Class<TestModel>('TestModel')({
    id: Generated(PostId),
    createdAt: DateTimeInsert,
  }) {}

  describe('get variant', () => {
    it('should decode Timestamp to DateTime.Utc', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({
        id: 'post-1',
        createdAt: { seconds: 1705315800, nanoseconds: 0 },
      });

      expect(EffectDateTime.isDateTime(result.createdAt)).toBe(true);
    });
  });

  describe('json variant', () => {
    it('should decode ISO string to DateTime.Utc', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({
        id: 'post-1',
        createdAt: '2024-01-15T10:30:00.000Z',
      });

      expect(EffectDateTime.isDateTime(result.createdAt)).toBe(true);
    });
  });

  describe('update variant', () => {
    it('should not include createdAt in update variant', () => {
      const decode = Schema.decodeUnknownSync(TestModel.update);
      const result = decode({ id: 'post-1' });

      expect((result as Record<string, unknown>)['createdAt']).toBeUndefined();
    });
  });
});

describe('Model.DateTimeUpdate', () => {
  const PostId = Schema.String.pipe(Schema.brand('PostId'));

  class TestModel extends Class<TestModel>('TestModel')({
    id: Generated(PostId),
    updatedAt: DateTimeUpdate,
  }) {}

  describe('get variant', () => {
    it('should decode Timestamp to DateTime.Utc', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({
        id: 'post-1',
        updatedAt: { seconds: 1705315800, nanoseconds: 0 },
      });

      expect(EffectDateTime.isDateTime(result.updatedAt)).toBe(true);
    });
  });

  describe('json variant', () => {
    it('should decode ISO string to DateTime.Utc', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({
        id: 'post-1',
        updatedAt: '2024-01-15T10:30:00.000Z',
      });

      expect(EffectDateTime.isDateTime(result.updatedAt)).toBe(true);
    });
  });

  describe('update variant', () => {
    it('should include updatedAt field', () => {
      const decode = Schema.decodeUnknownSync(TestModel.update);
      // For update variant with ServerDateTime, we decode from Timestamp
      const result = decode({
        id: 'post-1',
        updatedAt: { seconds: 1705315800, nanoseconds: 0 },
      });

      expect(EffectDateTime.isDateTime(result.updatedAt)).toBe(true);
    });
  });
});
