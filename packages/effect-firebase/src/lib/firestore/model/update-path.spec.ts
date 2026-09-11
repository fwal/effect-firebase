import { describe, expect, it } from 'vitest';
import { Option, Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import {
  MAX_FIELD_PATH_DEPTH,
  flattenForMerge,
  isFieldPath,
  resolveFieldPath,
  type UpdateData,
} from './update-path.js';
import { OptionalDeletable } from './optional.js';
import * as FirestoreNumber from './number.js';
import { TimestampDateTimeUtc } from '../schema/timestamp.js';

class Inner extends Schema.Class<Inner>('Inner')({ x: Schema.Number }) {}

// Recursive map declared as an interface…
interface INode {
  readonly label: string;
  readonly next?: INode;
}
const INode: Schema.Codec<INode> = Schema.Struct({
  label: Schema.String,
  next: Schema.optionalKey(Schema.suspend((): Schema.Codec<INode> => INode)),
});
// …and as a type alias; both get typed paths.
type ANode = { readonly label: string; readonly next?: ANode };
const ANode: Schema.Codec<ANode> = Schema.Struct({
  label: Schema.String,
  next: Schema.optionalKey(Schema.suspend((): Schema.Codec<ANode> => ANode)),
});

class Doc extends Model.Class<Doc>('Doc')({
  id: Schema.String,
  plain: Schema.Struct({ a: Schema.Struct({ b: Schema.Boolean }) }),
  optional: Schema.optional(Schema.Struct({ a: Schema.String })),
  deletable: OptionalDeletable(Schema.Struct({ a: Schema.String })),
  variant: Model.Struct({ likes: FirestoreNumber.Number }),
  klass: Inner,
  record: Schema.Record(Schema.String, Schema.Number),
  keyed: Schema.Record(
    Schema.TemplateLiteral(['k_', Schema.String]),
    Schema.Number,
  ),
  scalar: Schema.String,
  inode: INode,
  anode: ANode,
  stamp: TimestampDateTimeUtc,
  arr: Schema.Array(Schema.String),
  // Same field shapes as GeoPoint / Reference / Increment / ArrayUnion.
  geo: Schema.Struct({ latitude: Schema.Number, longitude: Schema.Number }),
  file: Schema.Struct({
    id: Schema.String,
    path: Schema.String,
    size: Schema.Number,
  }),
  op: Schema.Struct({ operand: Schema.Number }),
  vals: Schema.Struct({ values: Schema.Array(Schema.Unknown) }),
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

  it('checks Record segments against a constrained key schema', () => {
    expect(resolves('keyed.k_visits')).toBe(true);
    expect(resolves('keyed.visits')).toBe(false);
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

describe('resolveFieldPath on recursive schemas', () => {
  it('follows Schema.suspend for as many levels as the path names', () => {
    expect(resolves('inode.label')).toBe(true);
    expect(resolves('inode.next.label')).toBe(true);
    expect(resolves('inode.next.next.next.label')).toBe(true);
    expect(resolves('inode.next.nope')).toBe(false);
  });

  it('rejects paths deeper than MAX_FIELD_PATH_DEPTH', () => {
    const atCap = [
      'anode',
      ...Array(MAX_FIELD_PATH_DEPTH - 1).fill('next'),
      'label',
    ];
    expect(atCap.length - 1).toBe(MAX_FIELD_PATH_DEPTH);
    expect(resolves(atCap.join('.'))).toBe(true);
    expect(resolves([...atCap.slice(0, -1), 'next', 'label'].join('.'))).toBe(
      false,
    );
  });

  it('types paths into recursive aliases and interfaces up to the cap', () => {
    type U = UpdateData<Omit<typeof Doc.update.Type, 'id'>>;
    const ok: U = {
      'anode.next.label': 'x',
      'anode.next.next.next.next.label': 'x', // depth 5
      'inode.next.label': 'x',
      inode: { label: 'whole value' },
    };
    const tooDeep: U = {
      // @ts-expect-error depth 6 exceeds MAX_FIELD_PATH_DEPTH
      'anode.next.next.next.next.next.label': 'x',
    };
    const wrongLeaf: U = {
      // @ts-expect-error label is a string
      'anode.next.label': 1,
    };
    expect([ok, tooDeep, wrongLeaf]).toBeDefined();
  });

  it('descends into Schema.Class instances but not into leaf classes', () => {
    type U = UpdateData<Omit<typeof Doc.update.Type, 'id'>>;
    const ok: U = { 'klass.x': 1 };
    const intoDateTime: U = {
      // @ts-expect-error Timestamp-backed values are leaves
      'stamp.epochMillis': 1,
    };
    const intoIncrement: U = {
      // @ts-expect-error sentinels are leaves
      'variant.likes.operand': 1,
    };
    const intoArray: U = {
      // @ts-expect-error arrays are leaves
      'arr.0': 'x',
    };
    expect([ok, intoDateTime, intoIncrement, intoArray]).toBeDefined();
  });

  it('matches leaf classes nominally, so structs with the same shape are maps', () => {
    type U = UpdateData<Omit<typeof Doc.update.Type, 'id'>>;
    const ok: U = {
      'geo.latitude': 1,
      'file.path': 'a/b',
      'op.operand': 2,
      'vals.values': [],
    };
    expect(ok).toBeDefined();
    expect(resolves('geo.latitude')).toBe(true);
    expect(resolves('file.path')).toBe(true);
  });
});

describe('flattenForMerge', () => {
  it('flattens plain objects and the contents of Option.some', () => {
    expect(
      flattenForMerge({
        a: { b: { c: 1 }, d: 2 },
        e: Option.some({ f: 3 }),
        'g.h': 4,
      }),
    ).toEqual({ 'a.b.c': 1, 'a.d': 2, 'e.f': 3, 'g.h': 4 });
  });

  it('keeps arrays, class instances, Option.none and Option.some(leaf) whole', () => {
    const date = new Date(0);
    const some = Option.some(1);
    expect(
      flattenForMerge({
        arr: [{ x: 1 }],
        date,
        none: Option.none(),
        some,
        nested: { some },
      }),
    ).toEqual({
      arr: [{ x: 1 }],
      date,
      none: Option.none(),
      some,
      'nested.some': some,
    });
  });

  it('contributes nothing for empty objects', () => {
    expect(flattenForMerge({ a: {}, b: { c: {} } })).toEqual({});
  });
});

describe('isFieldPath', () => {
  it('is true only for dotted keys', () => {
    expect(isFieldPath('a.b')).toBe(true);
    expect(isFieldPath('a')).toBe(false);
  });
});
