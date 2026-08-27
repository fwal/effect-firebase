import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Model } from 'effect/unstable/schema';
import { WithIncrementField, Number } from './number.js';
import { Increment, increment } from '../fields/increment.js';

describe('WithIncrementField', () => {
  class TestModel extends Model.Class<TestModel>('TestModel')({
    name: Schema.String,
    likes: WithIncrementField(Schema.Number),
  }) {}

  describe('get variant', () => {
    it('should decode a number', () => {
      const result = Schema.decodeUnknownSync(TestModel)({
        name: 'Post',
        likes: 5,
      });
      expect(result.likes).toBe(5);
    });

    it('should encode a number', () => {
      const result = Schema.encodeSync(TestModel)(
        TestModel.make({ name: 'Post', likes: 5 }),
      );
      expect(result.likes).toBe(5);
    });
  });

  describe('insert variant', () => {
    it('should reject an Increment sentinel (not part of insert variant)', () => {
      expect(() =>
        Schema.decodeUnknownSync(TestModel.insert)({
          name: 'Post',
          likes: increment(1),
        }),
      ).toThrow();
    });
  });

  describe('update variant', () => {
    it('should accept a plain number', () => {
      const result = Schema.decodeUnknownSync(TestModel.update)({
        name: 'Post',
        likes: 5,
      });
      expect(result.likes).toBe(5);
    });

    it('should accept an Increment sentinel', () => {
      const result = Schema.decodeUnknownSync(TestModel.update)({
        name: 'Post',
        likes: increment(2),
      });
      expect(result.likes).toBeInstanceOf(Increment);
      expect((result.likes as Increment).operand).toBe(2);
    });

    it('should encode Increment sentinel as-is (for converter to handle)', () => {
      const result = Schema.encodeSync(TestModel.update)({
        name: 'Post',
        likes: increment(-1),
      });
      expect(result.likes).toBeInstanceOf(Increment);
      expect((result.likes as Increment).operand).toBe(-1);
    });
  });

  describe('json variant', () => {
    it('should decode a number', () => {
      const result = Schema.decodeUnknownSync(TestModel.json)({
        name: 'Post',
        likes: 5,
      });
      expect(result.likes).toBe(5);
    });

    it('should reject sentinels (not part of json variant)', () => {
      expect(() =>
        Schema.decodeUnknownSync(TestModel.json)({
          name: 'Post',
          likes: increment(1),
        }),
      ).toThrow();
    });
  });
});

describe('Number', () => {
  class TestModel extends Model.Class<TestModel>('TestModel')({
    name: Schema.String,
    likes: Number,
  }) {}

  it('get variant decodes number', () => {
    const result = Schema.decodeUnknownSync(TestModel)({
      name: 'Post',
      likes: 1,
    });
    expect(result.likes).toBe(1);
  });

  it('update variant accepts Increment', () => {
    const result = Schema.decodeUnknownSync(TestModel.update)({
      name: 'Post',
      likes: increment(3),
    });
    expect(result.likes).toBeInstanceOf(Increment);
  });
});
