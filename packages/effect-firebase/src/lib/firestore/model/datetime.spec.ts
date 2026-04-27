import { DateTime as EffectDateTime, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Model } from 'effect/unstable/schema';
import { DateTime, DateTimeInsert, DateTimeUpdate } from './datetime.js';
import { Timestamp } from '../schema/timestamp.js';
import * as FirestoreSchema from '../schema/schema.js';

describe('Model.DateTime', () => {
  const PostId = Schema.String.pipe(Schema.brand('PostId'));

  class TestModel extends Model.Class<TestModel>('TestModel')({
    id: Model.Generated(PostId),
    createdAt: DateTime,
  }) {}

  describe('get variant', () => {
    it('should decode Timestamp to DateTime.Utc', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({
        id: 'post-1',
        createdAt: Timestamp.fromMillis(1705315800123),
      });

      expect(EffectDateTime.isDateTime(result.createdAt)).toBe(true);
      expect(EffectDateTime.toEpochMillis(result.createdAt)).toBe(
        1705315800123
      );
    });

    it('should encode DateTime.Utc to Timestamp', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({
          id: 'post-1' as typeof PostId.Type,
          createdAt: EffectDateTime.makeUnsafe(1705315800123),
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
      const decode = Schema.decodeUnknownSync(TestModel.insert);
      const result = decode({
        createdAt: Timestamp.fromMillis(1705315800000),
      });

      expect(EffectDateTime.isDateTime(result.createdAt)).toBe(true);
    });

    it('should encode DateTime.Utc to Timestamp', () => {
      const encode = Schema.encodeSync(TestModel.insert);
      const result = encode({
        createdAt: EffectDateTime.makeUnsafe(1705315800000),
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
      const dt = EffectDateTime.makeUnsafe(1705315800123);
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

  class TestModel extends Model.Class<TestModel>('TestModel')({
    id: Model.Generated(PostId),
    createdAt: DateTimeInsert,
  }) {}

  describe('get variant', () => {
    it('should decode Timestamp to DateTime.Utc', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({
        id: 'post-1',
        createdAt: Timestamp.fromMillis(1705315800000),
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

  describe('insert variant', () => {
    it('should encode undefined to ServerTimestamp', () => {
      const encode = Schema.encodeSync(TestModel.insert);
      const result = encode({ createdAt: undefined });

      expect(result.createdAt).toBeInstanceOf(FirestoreSchema.ServerTimestamp);
    });

    it('should encode a DateTime.Utc value to Timestamp', () => {
      const encode = Schema.encodeSync(TestModel.insert);
      const millis = 1705315800000;
      const result = encode({ createdAt: EffectDateTime.makeUnsafe(millis) });

      expect(result.createdAt).toEqual({
        seconds: Math.floor(millis / 1000),
        nanoseconds: 0,
      });
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

  class TestModel extends Model.Class<TestModel>('TestModel')({
    id: Model.Generated(PostId),
    updatedAt: DateTimeUpdate,
  }) {}

  describe('get variant', () => {
    it('should decode Timestamp to DateTime.Utc', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({
        id: 'post-1',
        updatedAt: Timestamp.fromMillis(1705315800000),
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
      const result = decode({
        id: 'post-1',
        updatedAt: Timestamp.fromMillis(1705315800000),
      });

      expect(EffectDateTime.isDateTime(result.updatedAt)).toBe(true);
    });

    it('should encode undefined to ServerTimestamp', () => {
      const encode = Schema.encodeSync(TestModel.update);
      const result = encode({
        id: 'post-1' as typeof PostId.Type,
        updatedAt: undefined,
      });

      expect(result.updatedAt).toBeInstanceOf(FirestoreSchema.ServerTimestamp);
    });
  });
});
