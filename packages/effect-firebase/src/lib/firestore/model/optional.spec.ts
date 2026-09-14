import { DateTime as EffectDateTime, Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Model } from 'effect/unstable/schema';

import { Optional, OptionalNull, OptionalDeletable } from './optional.js';
import { DateTime } from './datetime.js';
import { Reference } from './reference.js';
import { Delete, delete as deleteField } from '../fields/delete.js';

describe('Optional', () => {
  class TestModel extends Model.Class<TestModel>('TestModel')({
    name: Schema.String,
    bio: Optional(Schema.String),
  }) {}

  describe.each([
    ['select', () => TestModel],
    ['insert', () => TestModel.insert],
    ['update', () => TestModel.update],
  ] as const)('%s variant', (_, variant) => {
    it('should decode value to Option.some', () => {
      const decode = Schema.decodeUnknownSync(variant());
      const result = decode({ name: 'John', bio: 'Developer' });

      expect(Option.isSome(result.bio)).toBe(true);
      expect(Option.getOrNull(result.bio)).toBe('Developer');
    });

    it('should decode missing key to Option.none', () => {
      const decode = Schema.decodeUnknownSync(variant());
      const result = decode({ name: 'John' });

      expect(Option.isNone(result.bio)).toBe(true);
    });

    it('should decode null to Option.none', () => {
      const decode = Schema.decodeUnknownSync(variant());
      const result = decode({ name: 'John', bio: null });

      expect(Option.isNone(result.bio)).toBe(true);
    });

    it('should decode undefined to Option.none', () => {
      const decode = Schema.decodeUnknownSync(variant());
      const result = decode({ name: 'John', bio: undefined });

      expect(Option.isNone(result.bio)).toBe(true);
    });
  });

  describe.each([
    ['insert', () => TestModel.insert],
    ['update', () => TestModel.update],
  ] as const)('encoding %s variant', (_, variant) => {
    it('should encode Option.none as null', () => {
      const encode = Schema.encodeUnknownSync(variant());
      const result = encode({ name: 'John', bio: Option.none() });

      expect(result).toHaveProperty('bio');
      expect(result.bio).toBeNull();
    });

    it('should encode Option.some with the value', () => {
      const encode = Schema.encodeUnknownSync(variant());
      const result = encode({ name: 'John', bio: Option.some('Developer') });

      expect(result.bio).toBe('Developer');
    });
  });

  describe('encoding get variant', () => {
    it('should encode Option.none as null', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({ name: 'John', bio: Option.none() }),
      );

      expect(result).toHaveProperty('bio');
      expect(result.bio).toBeNull();
    });

    it('should encode Option.some with the value', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({ name: 'John', bio: Option.some('Developer') }),
      );

      expect(result.bio).toBe('Developer');
    });
  });

  describe('encoded types', () => {
    it('should allow omitting the key in the database Encoded types', () => {
      const select: typeof TestModel.Encoded = { name: 'John' };
      const insert: typeof TestModel.insert.Encoded = { name: 'John' };
      const update: typeof TestModel.update.Encoded = { name: 'John' };

      expect(select).toEqual({ name: 'John' });
      expect(insert).toEqual({ name: 'John' });
      expect(update).toEqual({ name: 'John' });
    });

    it('should still accept null and the value in the Encoded types', () => {
      const withNull: typeof TestModel.Encoded = { name: 'John', bio: null };
      const withValue: typeof TestModel.Encoded = {
        name: 'John',
        bio: 'Developer',
      };

      expect(withNull.bio).toBeNull();
      expect(withValue.bio).toBe('Developer');
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

    it('should reject null', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);

      expect(() => decode({ name: 'John', bio: null })).toThrow();
    });

    it('should encode Option.none as a missing key', () => {
      const encode = Schema.encodeSync(TestModel.json);
      const result = encode({ name: 'John', bio: Option.none() });

      expect(result).not.toHaveProperty('bio');
    });
  });

  describe.each([
    ['jsonCreate', () => TestModel.jsonCreate],
    ['jsonUpdate', () => TestModel.jsonUpdate],
  ] as const)('%s variant', (_, variant) => {
    it('should decode missing key and null to Option.none', () => {
      const decode = Schema.decodeUnknownSync(variant());

      expect(Option.isNone(decode({ name: 'John' }).bio)).toBe(true);
      expect(Option.isNone(decode({ name: 'John', bio: null }).bio)).toBe(true);
    });

    it('should encode Option.none as a missing key', () => {
      const encode = Schema.encodeUnknownSync(variant());
      const result = encode({ name: 'John', bio: Option.none() });

      expect(result).not.toHaveProperty('bio');
    });
  });

  describe('multi-variant fields', () => {
    const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));

    class DateModel extends Model.Class<DateModel>('DateModel')({
      publishedAt: Optional(DateTime),
      author: Optional(Reference(AuthorId, 'authors')),
    }) {}

    it('should decode missing keys to Option.none for all database variants', () => {
      const select = Schema.decodeUnknownSync(DateModel)({});
      const insert = Schema.decodeUnknownSync(DateModel.insert)({});
      const update = Schema.decodeUnknownSync(DateModel.update)({});

      expect(Option.isNone(select.publishedAt)).toBe(true);
      expect(Option.isNone(select.author)).toBe(true);
      expect(Option.isNone(insert.publishedAt)).toBe(true);
      expect(Option.isNone(insert.author)).toBe(true);
      expect(Option.isNone(update.publishedAt)).toBe(true);
      expect(Option.isNone(update.author)).toBe(true);
    });

    it('should type the decoded fields as Option', () => {
      const encoded: typeof DateModel.Encoded = {};
      const model = Schema.decodeUnknownSync(DateModel)(encoded);
      const publishedAt: Option.Option<EffectDateTime.Utc> = model.publishedAt;
      const author: Option.Option<typeof AuthorId.Type> = model.author;

      expect(Option.isNone(publishedAt)).toBe(true);
      expect(Option.isNone(author)).toBe(true);
    });

    it('should encode Option.none as null', () => {
      const result = Schema.encodeSync(DateModel)(
        new DateModel({ publishedAt: Option.none(), author: Option.none() }),
      );

      expect(result.publishedAt).toBeNull();
      expect(result.author).toBeNull();
    });
  });
});

describe('OptionalNull', () => {
  class TestModel extends Model.Class<TestModel>('TestModel')({
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
        new TestModel({ name: 'John', bio: Option.none() }),
      );

      expect(result.bio).toBeNull();
    });

    it('should encode Option.some with the value', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({ name: 'John', bio: Option.some('Developer') }),
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
  class TestModel extends Model.Class<TestModel>('TestModel')({
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

    it('should decode missing key to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel.update);
      const result = decode({ name: 'John' });

      expect(Option.isNone(result.bio)).toBe(true);
    });

    it('should reject null', () => {
      const decode = Schema.decodeUnknownSync(TestModel.update);

      expect(() => decode({ name: 'John', bio: null })).toThrow();
    });
  });

  describe('get variant', () => {
    it('should decode missing key to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({ name: 'John' });

      expect(Option.isNone(result.bio)).toBe(true);
    });
  });

  describe('encoding get variant', () => {
    it('should encode Option.none as undefined', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({ name: 'John', bio: Option.none() }),
      );

      expect(result.bio).toBeUndefined();
    });

    it('should encode Option.some with the value', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({ name: 'John', bio: Option.some('Developer') }),
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

      expect(result.bio).toBeInstanceOf(Delete);
    });

    it('should encode Option.none as a missing key', () => {
      const encode = Schema.encodeSync(TestModel.update);
      const result = encode({ name: 'John', bio: Option.none() });

      expect(result).not.toHaveProperty('bio');
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
