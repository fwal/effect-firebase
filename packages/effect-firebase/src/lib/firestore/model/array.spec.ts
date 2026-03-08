import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Class } from './core.js';
import { WithArrayFields, Array } from './array.js';
import {
  ArrayUnion,
  ArrayRemove,
  arrayUnion,
  arrayRemove,
} from '../fields/array.js';

describe('WithArrayFields', () => {
  class TestModel extends Class<TestModel>('TestModel')({
    name: Schema.String,
    tags: WithArrayFields(Schema.Array(Schema.String)),
  }) {}

  describe('get variant', () => {
    it('should decode an array', () => {
      const result = Schema.decodeUnknownSync(TestModel)({
        name: 'Post',
        tags: ['a', 'b'],
      });
      expect(result.tags).toEqual(['a', 'b']);
    });

    it('should encode an array', () => {
      const result = Schema.encodeSync(TestModel)(
        TestModel.make({ name: 'Post', tags: ['a', 'b'] })
      );
      expect(result.tags).toEqual(['a', 'b']);
    });
  });

  describe('update variant', () => {
    it('should accept a plain array', () => {
      const result = Schema.decodeUnknownSync(TestModel.update)({
        name: 'Post',
        tags: ['a', 'b'],
      });
      expect(result.tags).toEqual(['a', 'b']);
    });

    it('should accept an ArrayUnion sentinel', () => {
      const result = Schema.decodeUnknownSync(TestModel.update)({
        name: 'Post',
        tags: arrayUnion(['c', 'd']),
      });
      expect(result.tags).toBeInstanceOf(ArrayUnion);
      expect(result.tags.values).toEqual(['c', 'd']);
    });

    it('should accept an ArrayRemove sentinel', () => {
      const result = Schema.decodeUnknownSync(TestModel.update)({
        name: 'Post',
        tags: arrayRemove(['a']),
      });
      expect(result.tags).toBeInstanceOf(ArrayRemove);
      expect(result.tags.values).toEqual(['a']);
    });

    it('should encode ArrayUnion sentinel as-is (for converter to handle)', () => {
      const result = Schema.encodeSync(TestModel.update)({
        name: 'Post',
        tags: arrayUnion(['c']),
      });
      expect(result.tags).toBeInstanceOf(ArrayUnion);
      expect(result.tags.values).toEqual(['c']);
    });

    it('should encode ArrayRemove sentinel as-is (for converter to handle)', () => {
      const result = Schema.encodeSync(TestModel.update)({
        name: 'Post',
        tags: arrayRemove(['a']),
      });
      expect(result.tags).toBeInstanceOf(ArrayRemove);
      expect(result.tags.values).toEqual(['a']);
    });
  });

  describe('json variant', () => {
    it('should decode an array', () => {
      const result = Schema.decodeUnknownSync(TestModel.json)({
        name: 'Post',
        tags: ['a', 'b'],
      });
      expect(result.tags).toEqual(['a', 'b']);
    });

    it('should reject sentinels (not part of json variant)', () => {
      expect(() =>
        Schema.decodeUnknownSync(TestModel.json)({
          name: 'Post',
          tags: arrayUnion(['c']),
        })
      ).toThrow();
    });
  });
});

describe('Array', () => {
  class TestModel extends Class<TestModel>('TestModel')({
    name: Schema.String,
    tags: Array(Schema.String),
  }) {}

  it('get variant decodes array', () => {
    const result = Schema.decodeUnknownSync(TestModel)({
      name: 'Post',
      tags: ['x'],
    });
    expect(result.tags).toEqual(['x']);
  });

  it('update variant accepts ArrayUnion', () => {
    const result = Schema.decodeUnknownSync(TestModel.update)({
      name: 'Post',
      tags: arrayUnion(['y']),
    });
    expect(result.tags).toBeInstanceOf(ArrayUnion);
  });

  it('update variant accepts ArrayRemove', () => {
    const result = Schema.decodeUnknownSync(TestModel.update)({
      name: 'Post',
      tags: arrayRemove(['x']),
    });
    expect(result.tags).toBeInstanceOf(ArrayRemove);
  });
});
