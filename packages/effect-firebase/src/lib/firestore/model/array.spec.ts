import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Model } from 'effect/unstable/schema';
import { WithArrayFields, Array } from './array.js';
import {
  ArrayUnion,
  ArrayRemove,
  arrayUnion,
  arrayRemove,
} from '../fields/array.js';

describe('WithArrayFields', () => {
  class TestModel extends Model.Class<TestModel>('TestModel')({
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
        TestModel.make({ name: 'Post', tags: ['a', 'b'] }),
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

    it('should encode ArrayUnion sentinel values through the element schema', () => {
      const result = Schema.encodeSync(TestModel.update)({
        name: 'Post',
        tags: arrayUnion(['c']),
      });
      expect(result.tags).toBeInstanceOf(ArrayUnion);
      expect(result.tags.values).toEqual(['c']);
    });

    it('should encode ArrayRemove sentinel values through the element schema', () => {
      const result = Schema.encodeSync(TestModel.update)({
        name: 'Post',
        tags: arrayRemove(['a']),
      });
      expect(result.tags).toBeInstanceOf(ArrayRemove);
      expect(result.tags.values).toEqual(['a']);
    });
  });

  describe('update variant with a non-identity element encode', () => {
    class NumberTagsModel extends Model.Class<NumberTagsModel>(
      'NumberTagsModel',
    )({
      name: Schema.String,
      tags: WithArrayFields(Schema.Array(Schema.NumberFromString)),
    }) {}

    it('encodes ArrayUnion sentinel values through the element schema', () => {
      const result = Schema.encodeSync(NumberTagsModel.update)({
        name: 'Post',
        tags: arrayUnion([3, 4]),
      });
      expect(result.tags).toBeInstanceOf(ArrayUnion);
      expect(result.tags.values).toEqual(['3', '4']);
    });

    it('encodes ArrayRemove sentinel values through the element schema', () => {
      const result = Schema.encodeSync(NumberTagsModel.update)({
        name: 'Post',
        tags: arrayRemove([3]),
      });
      expect(result.tags).toBeInstanceOf(ArrayRemove);
      expect(result.tags.values).toEqual(['3']);
    });

    it('decodes an ArrayUnion sentinel unchanged (values are app-domain)', () => {
      const result = Schema.decodeUnknownSync(NumberTagsModel.update)({
        name: 'Post',
        tags: arrayUnion([3]),
      });
      expect(result.tags).toBeInstanceOf(ArrayUnion);
      expect((result.tags as ArrayUnion).values).toEqual([3]);
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
        }),
      ).toThrow();
    });
  });
});

describe('Array', () => {
  class TestModel extends Model.Class<TestModel>('TestModel')({
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
