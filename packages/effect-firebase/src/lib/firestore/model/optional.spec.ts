import { Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Class } from './core.js';

import { Optional, OptionalNull, OptionalDeletable } from './optional.js';
import { Delete, delete as deleteField } from '../fields/delete.js';

describe('Optional', () => {
  class TestModel extends Class<TestModel>('TestModel')({
    name: Schema.String,
    bio: Optional(Schema.String),
  }) {}

  describe('get variant', () => {
    it('should decode value to Option.some', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({ name: 'John', bio: 'Developer' });

      expect(Option.isSome(result.bio)).toBe(true);
      expect(Option.getOrNull(result.bio)).toBe('Developer');
    });

    it('should decode null to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({ name: 'John', bio: null });

      expect(Option.isNone(result.bio)).toBe(true);
    });

    it('should decode undefined to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({ name: 'John', bio: undefined });

      expect(Option.isNone(result.bio)).toBe(true);
    });
  });

  describe('encoding get variant', () => {
    it('should encode Option.none as null', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({ name: 'John', bio: Option.none() })
      );

      expect(result.bio).toBeNull();
    });

    it('should encode Option.some with the value', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({ name: 'John', bio: Option.some('Developer') })
      );

      expect(result.bio).toBe('Developer');
    });
  });

  describe('json variant', () => {
    it('should decode present value to Option.some', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({ name: 'John', bio: 'Developer' });

      expect(Option.isSome(result.bio)).toBe(true);
    });

    it('should decode missing key to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({ name: 'John' });

      expect(Option.isNone(result.bio)).toBe(true);
    });
  });
});

describe('OptionalNull', () => {
  class TestModel extends Class<TestModel>('TestModel')({
    name: Schema.String,
    bio: OptionalNull(Schema.String),
  }) {}

  describe('get variant', () => {
    it('should decode value to Option.some', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({ name: 'John', bio: 'Developer' });

      expect(Option.isSome(result.bio)).toBe(true);
      expect(Option.getOrNull(result.bio)).toBe('Developer');
    });

    it('should decode null to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({ name: 'John', bio: null });

      expect(Option.isNone(result.bio)).toBe(true);
    });

    it('should reject undefined', () => {
      const decode = Schema.decodeUnknownSync(TestModel);

      expect(() => decode({ name: 'John', bio: undefined })).toThrow();
    });
  });

  describe('encoding get variant', () => {
    it('should encode Option.none as null', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({ name: 'John', bio: Option.none() })
      );

      expect(result.bio).toBeNull();
    });

    it('should encode Option.some with the value', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({ name: 'John', bio: Option.some('Developer') })
      );

      expect(result.bio).toBe('Developer');
    });
  });

  describe('json variant', () => {
    it('should decode present value to Option.some', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({ name: 'John', bio: 'Developer' });

      expect(Option.isSome(result.bio)).toBe(true);
    });

    it('should decode missing key to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({ name: 'John' });

      expect(Option.isNone(result.bio)).toBe(true);
    });
  });
});

describe('OptionalDeletable', () => {
  class TestModel extends Class<TestModel>('TestModel')({
    name: Schema.String,
    bio: OptionalDeletable(Schema.String),
  }) {}

  describe('get variant', () => {
    it('should decode value to Option.some', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({ name: 'John', bio: 'Developer' });

      expect(Option.isSome(result.bio)).toBe(true);
      expect(Option.getOrNull(result.bio)).toBe('Developer');
    });

    it('should decode undefined to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({ name: 'John', bio: undefined });

      expect(Option.isNone(result.bio)).toBe(true);
    });

    it('should reject null', () => {
      const decode = Schema.decodeUnknownSync(TestModel);

      expect(() => decode({ name: 'John', bio: null })).toThrow();
    });
  });

  describe('update variant', () => {
    it('should decode Delete value to Option.some', () => {
      const decode = Schema.decodeUnknownSync(TestModel.update);
      const result = decode({ name: 'John', bio: deleteField() });

      expect(Option.isSome(result.bio)).toBe(true);
      expect(Option.getOrNull(result.bio)).toBeInstanceOf(Delete);
    });

    it('should decode undefined to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel.update);
      const result = decode({ name: 'John', bio: undefined });

      expect(Option.isNone(result.bio)).toBe(true);
    });
  });

  describe('encoding get variant', () => {
    it('should encode Option.none as undefined', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({ name: 'John', bio: Option.none() })
      );

      expect(result.bio).toBeUndefined();
    });

    it('should encode Option.some with the value', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({ name: 'John', bio: Option.some('Developer') })
      );

      expect(result.bio).toBe('Developer');
    });
  });

  describe('encoding update variant', () => {
    it('should encode Delete value', () => {
      const encode = Schema.encodeSync(TestModel.update);
      const result = encode({
        name: 'John',
        bio: Option.some(deleteField()),
      });

      expect(result.bio).toBeDefined();
    });
  });

  describe('json variant', () => {
    it('should decode present value to Option.some', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({ name: 'John', bio: 'Developer' });

      expect(Option.isSome(result.bio)).toBe(true);
    });

    it('should decode missing key to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({ name: 'John' });

      expect(Option.isNone(result.bio)).toBe(true);
    });
  });
});
