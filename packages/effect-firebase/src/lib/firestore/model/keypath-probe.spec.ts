/**
 * Investigation groundwork for schema-driven atomic key-path updates
 * (e.g. `repo.updateFields(id, { 'statuses.read': true })`).
 *
 * Validates that a dotted field path can be resolved to a leaf schema by
 * traversing the model's `update` variant struct, and that the leaf value
 * can be encoded with full schema semantics (transforms, sentinels).
 * The traversal helper defined here is the reference behavior for a future
 * `Repository.updateFields` implementation.
 */
import { describe, expect, it } from 'vitest';
import { DateTime, Effect, Option, Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import * as ModelExt from './index.js';
import * as FirestoreSchema from '../schema/schema.js';
import { arrayUnion } from '../fields/array.js';
import { Delete } from '../fields/delete.js';

const PostId = Schema.String.pipe(Schema.brand('PostId'));

class PostModel extends Model.Class<PostModel>('PostModel')({
  id: Model.GeneratedByDb(PostId),
  title: Schema.String,
  updatedAt: ModelExt.DateTimeUpdate,
  statuses: Schema.Struct({
    read: Schema.Boolean,
    archived: Schema.Boolean,
    inner: Schema.Struct({ deep: Schema.Number }),
  }),
  counts: Schema.Record(Schema.String, Schema.Number),
  tags: ModelExt.Array(Schema.String),
  optional: ModelExt.OptionalDeletable(Schema.String),
}) {}

// --------------------------------------------------------------------------
// Runtime traversal: find the leaf schema for a dotted path in an update
// variant struct. Mirrors the structures verified against effect 4.0.0-beta:
// - Struct exposes `.fields`
// - Record exposes `.value`
// - optional/optionalKey wrappers expose `.schema`
// --------------------------------------------------------------------------

type AnySchema = Schema.Top;

const unwrap = (s: AnySchema): AnySchema => {
  let current: AnySchema = s;
  // optionalKey wrapper
  while (
    'schema' in current &&
    current.schema !== undefined &&
    Schema.isSchema(current.schema)
  ) {
    current = current.schema as AnySchema;
  }
  return current;
};

const fieldAtPath = (
  struct: Schema.Struct<Schema.Struct.Fields>,
  path: string
): AnySchema | null => {
  const segments = path.split('.');
  let current: AnySchema | null = null;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const parent: AnySchema | null =
      i === 0 ? (struct as AnySchema) : unwrap(current as AnySchema);
    if (parent === null) return null;
    if (
      'fields' in parent &&
      typeof parent.fields === 'object' &&
      parent.fields !== null
    ) {
      current =
        ((parent.fields as Schema.Struct.Fields)[segment] as AnySchema) ??
        null;
    } else if (
      // Record<string, V> exposes both `key` and `value`; Schema.Array only
      // exposes `value`, so requiring both keeps arrays non-traversable.
      'key' in parent &&
      'value' in parent &&
      parent.ast._tag === 'Objects' &&
      Schema.isSchema(parent.value)
    ) {
      current = parent.value as AnySchema;
    } else {
      return null;
    }
    if (current === null) return null;
  }
  return current;
};

const encodeAtPaths = (
  struct: Schema.Struct<Schema.Struct.Fields>,
  data: Record<string, unknown>
) =>
  Effect.gen(function* () {
    const out: Record<string, unknown> = {};
    for (const [path, value] of Object.entries(data)) {
      const leaf = fieldAtPath(struct, path);
      if (leaf === null) {
        return yield* Effect.fail(
          new Error(`No schema found for field path "${path}"`)
        );
      }
      out[path] = yield* Schema.encodeEffect(leaf)(value);
    }
    return out;
  });

const updateStruct = PostModel.update as Schema.Struct<Schema.Struct.Fields>;

describe('key-path traversal + encoding probe', () => {
  it('encodes a nested boolean path', async () => {
    const result = await Effect.runPromise(
      encodeAtPaths(updateStruct, { 'statuses.read': true })
    );
    expect(result).toEqual({ 'statuses.read': true });
  });

  it('encodes a deep path', async () => {
    const result = await Effect.runPromise(
      encodeAtPaths(updateStruct, { 'statuses.inner.deep': 42 })
    );
    expect(result).toEqual({ 'statuses.inner.deep': 42 });
  });

  it('encodes a record path', async () => {
    const result = await Effect.runPromise(
      encodeAtPaths(updateStruct, { 'counts.views': 7 })
    );
    expect(result).toEqual({ 'counts.views': 7 });
  });

  it('encodes a DateTime leaf through the model transform', async () => {
    const now = DateTime.nowUnsafe();
    const result = await Effect.runPromise(
      encodeAtPaths(updateStruct, { updatedAt: now })
    );
    expect(result['updatedAt']).toBeInstanceOf(FirestoreSchema.Timestamp);
  });

  it('encodes array sentinels through the union leaf', async () => {
    const result = await Effect.runPromise(
      encodeAtPaths(updateStruct, { tags: arrayUnion(['x']) })
    );
    // sentinel instance passes through; converters map it to FieldValue later
    expect(result['tags']).toBeDefined();
  });

  it('encodes Delete sentinel through OptionalDeletable', async () => {
    const result = await Effect.runPromise(
      encodeAtPaths(updateStruct, { optional: Option.some(new Delete()) })
    );
    expect(result['optional']).toBeInstanceOf(Delete);
  });

  it('fails with a schema error for an invalid value', async () => {
    const exit = await Effect.runPromiseExit(
      encodeAtPaths(updateStruct, { 'statuses.read': 'nope' })
    );
    expect(exit._tag).toBe('Failure');
  });

  it('fails for unknown paths', async () => {
    const exit = await Effect.runPromiseExit(
      encodeAtPaths(updateStruct, { 'statuses.nope': true })
    );
    expect(exit._tag).toBe('Failure');
  });

  it('rejects paths into arrays (Schema.Array also exposes .value)', async () => {
    const exit = await Effect.runPromiseExit(
      encodeAtPaths(updateStruct, { 'tags.0': 'x' })
    );
    expect(exit._tag).toBe('Failure');
  });

  it('rejects paths through non-struct leaves (e.g. into a DateTime)', async () => {
    const exit = await Effect.runPromiseExit(
      encodeAtPaths(updateStruct, { 'updatedAt.epochMillis': 1 })
    );
    expect(exit._tag).toBe('Failure');
  });
});
