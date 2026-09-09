import { describe, expect, it } from 'vitest';
import { Option, Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import { isFieldPath, resolveFieldPath } from './update-path.js';
import { OptionalDeletable } from './optional.js';
import * as FirestoreNumber from './number.js';

class Inner extends Schema.Class<Inner>('Inner')({ x: Schema.Number }) {}

class Doc extends Model.Class<Doc>('Doc')({
  id: Schema.String,
  plain: Schema.Struct({ a: Schema.Struct({ b: Schema.Boolean }) }),
  optional: Schema.optional(Schema.Struct({ a: Schema.String })),
  deletable: OptionalDeletable(Schema.Struct({ a: Schema.String })),
  variant: Model.Struct({ likes: FirestoreNumber.Number }),
  klass: Inner,
  record: Schema.Record(Schema.String, Schema.Number),
  scalar: Schema.String,
}) {}

const root = Doc.update;
const resolves = (path: string) => Option.isSome(resolveFieldPath(root, path));

describe('resolveFieldPath', () => {
  it('descends through nested structs', () => {
    expect(resolves('plain.a')).toBe(true);
    expect(resolves('plain.a.b')).toBe(true);
  });

  it('unwraps optional, OptionalDeletable and variant-struct fields', () => {
    expect(resolves('optional.a')).toBe(true);
    expect(resolves('deletable.a')).toBe(true);
    expect(resolves('variant.likes')).toBe(true);
  });

  it('descends into Schema.Class fields', () => {
    expect(resolves('klass.x')).toBe(true);
  });

  it('resolves any key under a Record to its value schema', () => {
    expect(resolves('record.anything')).toBe(true);
  });

  it('returns None for undeclared segments and for paths into scalars', () => {
    expect(resolves('plain.nope')).toBe(false);
    expect(resolves('plain.a.b.c')).toBe(false);
    expect(resolves('scalar.length')).toBe(false);
    expect(resolves('missing.a')).toBe(false);
  });

  it('returns the leaf schema, not a wrapper, so it encodes standalone', () => {
    const leaf = Option.getOrThrow(resolveFieldPath(root, 'plain.a.b'));
    expect(Schema.encodeUnknownSync(leaf as Schema.Boolean)(true)).toBe(true);
  });
});

describe('isFieldPath', () => {
  it('is true only for dotted keys', () => {
    expect(isFieldPath('a.b')).toBe(true);
    expect(isFieldPath('a')).toBe(false);
  });
});
