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

// Regression test for the type-vs-runtime divergence on the `json` variant of
// composed `Optional(Field)` / `OptionalNull(Field)`. The hand-written
// conditional return type used to map `json` to `Schema.OptionFromOptionalNullOr`
// (admitting `null` in the `Encoded` type) while the runtime `Model.fieldEvolve`
// table maps `json` to `Schema.OptionFromOptional` (rejecting `null` with a
// `SchemaError`). The fix narrows the conditional's `json` branch to
// `Schema.OptionFromOptional`, matching both the runtime and
// `OptionalDeletable`'s existing conditional.
describe('composed json null-admission', () => {
  const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));

  // A multi-variant Field exposing all six variants (select/insert/update/json/
  // jsonCreate/jsonUpdate). Used with Optional/OptionalNull/OptionalDeletable,
  // this exercises the composed conditional's branch for every variant key.
  class OptionalRefModel extends Model.Class<OptionalRefModel>(
    'OptionalRefModel',
  )({
    name: Schema.String,
    author: Optional(Reference(AuthorId, 'authors')),
  }) {}

  class OptionalNullRefModel extends Model.Class<OptionalNullRefModel>(
    'OptionalNullRefModel',
  )({
    name: Schema.String,
    author: OptionalNull(Reference(AuthorId, 'authors')),
  }) {}

  class OptionalDeletableRefModel extends Model.Class<OptionalDeletableRefModel>(
    'OptionalDeletableRefModel',
  )({
    name: Schema.String,
    author: OptionalDeletable(Reference(AuthorId, 'authors')),
  }) {}

  // A multi-variant Field exposing only four variants (select/insert/update/json,
  // no jsonCreate/jsonUpdate). Exercised by the bug report.
  class OptionalDateModel extends Model.Class<OptionalDateModel>(
    'OptionalDateModel',
  )({
    name: Schema.String,
    at: Optional(DateTime),
  }) {}

  class OptionalNullDateModel extends Model.Class<OptionalNullDateModel>(
    'OptionalNullDateModel',
  )({
    name: Schema.String,
    at: OptionalNull(DateTime),
  }) {}

  describe('json runtime rejects null (unchanged by the type-only fix)', () => {
    it('Optional(Reference(...)) rejects null', () => {
      const decode = Schema.decodeUnknownSync(OptionalRefModel.json);
      expect(() => decode({ name: 'x', author: null })).toThrow();
    });

    it('OptionalNull(Reference(...)) rejects null', () => {
      const decode = Schema.decodeUnknownSync(OptionalNullRefModel.json);
      expect(() => decode({ name: 'x', author: null })).toThrow();
    });

    it('OptionalDeletable(Reference(...)) rejects null', () => {
      const decode = Schema.decodeUnknownSync(OptionalDeletableRefModel.json);
      expect(() => decode({ name: 'x', author: null })).toThrow();
    });

    it('Optional(DateTime) rejects null', () => {
      const decode = Schema.decodeUnknownSync(OptionalDateModel.json);
      expect(() => decode({ name: 'x', at: null })).toThrow();
    });

    it('OptionalNull(DateTime) rejects null', () => {
      const decode = Schema.decodeUnknownSync(OptionalNullDateModel.json);
      expect(() => decode({ name: 'x', at: null })).toThrow();
    });
  });

  // The fix is type-only. Each helper below is a typed identity function whose
  // parameter is the `json.Encoded` of a composed model. Calling it with
  // `{ ..., <field>: null }` is a type error iff the conditional return type
  // rejects `null` for the `json` variant — exactly the behaviour the fix
  // establishes for `Optional`/`OptionalNull` and the existing behaviour for
  // `OptionalDeletable`. The `@ts-expect-error` directive on the line above
  // each call is consumed only while the conditional correctly rejects `null`;
  // if the divergence ever returns the directive becomes "unused" and `tsc`
  // fails this file. Each declared const is referenced below to satisfy
  // `noUnusedLocals`.
  describe('json Encoded type rejects null for composed Optional/OptionalNull', () => {
    const expectJsonRef = (_: typeof OptionalRefModel.json.Encoded) => _;
    const expectJsonNullRef = (_: typeof OptionalNullRefModel.json.Encoded) =>
      _;
    const expectJsonDeletableRef = (
      _: typeof OptionalDeletableRefModel.json.Encoded,
    ) => _;
    const expectJsonDate = (_: typeof OptionalDateModel.json.Encoded) => _;
    const expectJsonNullDate = (_: typeof OptionalNullDateModel.json.Encoded) =>
      _;

    it('rejects null at the type level (all directives must be consumed)', () => {
      // @ts-expect-error null is not in Optional(Reference).json Encoded
      const ref = expectJsonRef({ name: 'x', author: null });
      // @ts-expect-error null is not in OptionalNull(Reference).json Encoded
      const nullRef = expectJsonNullRef({ name: 'x', author: null });
      // @ts-expect-error null is not in OptionalDeletable(Reference).json Encoded
      const deletableRef = expectJsonDeletableRef({ name: 'x', author: null });
      // @ts-expect-error null is not in Optional(DateTime).json Encoded
      const date = expectJsonDate({ name: 'x', at: null });
      // @ts-expect-error null is not in OptionalNull(DateTime).json Encoded
      const nullDate = expectJsonNullDate({ name: 'x', at: null });
      expect([ref, nullRef, deletableRef, date, nullDate]).toHaveLength(5);
    });
  });

  describe('jsonCreate/jsonUpdate Encoded types still admit null (no regression)', () => {
    it('Optional(Reference) jsonCreate/jsonUpdate still accept null', () => {
      const jsonCreate: typeof OptionalRefModel.jsonCreate.Encoded = {
        name: 'x',
        author: null,
      };
      const jsonUpdate: typeof OptionalRefModel.jsonUpdate.Encoded = {
        name: 'x',
        author: null,
      };
      expect([jsonCreate, jsonUpdate]).toHaveLength(2);
    });

    it('OptionalNull(Reference) jsonCreate/jsonUpdate still accept null', () => {
      const jsonCreate: typeof OptionalNullRefModel.jsonCreate.Encoded = {
        name: 'x',
        author: null,
      };
      const jsonUpdate: typeof OptionalNullRefModel.jsonUpdate.Encoded = {
        name: 'x',
        author: null,
      };
      expect([jsonCreate, jsonUpdate]).toHaveLength(2);
    });

    it('OptionalDeletable(Reference) jsonCreate/jsonUpdate still accept null', () => {
      const jsonCreate: typeof OptionalDeletableRefModel.jsonCreate.Encoded = {
        name: 'x',
        author: null,
      };
      const jsonUpdate: typeof OptionalDeletableRefModel.jsonUpdate.Encoded = {
        name: 'x',
        author: null,
      };
      expect([jsonCreate, jsonUpdate]).toHaveLength(2);
    });
  });

  describe('jsonCreate/jsonUpdate runtime still accept null (no regression)', () => {
    it('Optional(Reference) jsonCreate/jsonUpdate decode null to Option.none', () => {
      const jsonCreate = Schema.decodeUnknownSync(OptionalRefModel.jsonCreate);
      const jsonUpdate = Schema.decodeUnknownSync(OptionalRefModel.jsonUpdate);
      expect(
        Option.isNone(jsonCreate({ name: 'x', author: null }).author),
      ).toBe(true);
      expect(
        Option.isNone(jsonUpdate({ name: 'x', author: null }).author),
      ).toBe(true);
    });

    it('OptionalNull(Reference) jsonCreate/jsonUpdate decode null to Option.none', () => {
      const jsonCreate = Schema.decodeUnknownSync(
        OptionalNullRefModel.jsonCreate,
      );
      const jsonUpdate = Schema.decodeUnknownSync(
        OptionalNullRefModel.jsonUpdate,
      );
      expect(
        Option.isNone(jsonCreate({ name: 'x', author: null }).author),
      ).toBe(true);
      expect(
        Option.isNone(jsonUpdate({ name: 'x', author: null }).author),
      ).toBe(true);
    });

    it('OptionalDeletable(Reference) jsonCreate/jsonUpdate decode null to Option.none', () => {
      const jsonCreate = Schema.decodeUnknownSync(
        OptionalDeletableRefModel.jsonCreate,
      );
      const jsonUpdate = Schema.decodeUnknownSync(
        OptionalDeletableRefModel.jsonUpdate,
      );
      expect(
        Option.isNone(jsonCreate({ name: 'x', author: null }).author),
      ).toBe(true);
      expect(
        Option.isNone(jsonUpdate({ name: 'x', author: null }).author),
      ).toBe(true);
    });
  });
});
