import { Effect, Schema, SchemaGetter, SchemaParser } from 'effect';

/**
 * Represents an arrayUnion operation. This will add elements to an array field.
 * Only valid in the `update` variant — use `WithArraySentinels` to add support to a field.
 */
/** Type-level brand so `ArrayUnion` is matched nominally, not by field shape. */
export const ArrayUnionTypeId: unique symbol = Symbol.for(
  'effect-firebase/ArrayUnion',
);
export class ArrayUnion {
  declare readonly [ArrayUnionTypeId]: typeof ArrayUnionTypeId;
  constructor(public readonly values: readonly unknown[]) {}
}
export const ArrayUnionInstance = Schema.instanceOf(ArrayUnion, {
  jsonSchema: {
    type: 'object',
    required: ['values'],
    properties: { values: { type: 'array' } },
    additionalProperties: false,
  },
});

/**
 * Represents an arrayRemove operation. This will remove elements from an array field.
 * Only valid in the `update` variant — use `WithArraySentinels` to add support to a field.
 */
/** Type-level brand so `ArrayRemove` is matched nominally, not by field shape. */
export const ArrayRemoveTypeId: unique symbol = Symbol.for(
  'effect-firebase/ArrayRemove',
);
export class ArrayRemove {
  declare readonly [ArrayRemoveTypeId]: typeof ArrayRemoveTypeId;
  constructor(public readonly values: readonly unknown[]) {}
}

export const ArrayRemoveInstance = Schema.instanceOf(ArrayRemove, {
  jsonSchema: {
    type: 'object',
    required: ['values'],
    properties: { values: { type: 'array' } },
    additionalProperties: false,
  },
});

/**
 * Build an element-aware `ArrayUnion` schema for a given array element schema.
 *
 * The returned schema accepts an `ArrayUnion` sentinel (so it can slot into a
 * `Union` alongside the plain array schema) and, on encode, runs the
 * sentinel's inner `values` through `arraySchema` before rewrapping them in a
 * new `ArrayUnion` instance. The schema's Type and Encoded are still
 * `ArrayUnion`, but the inner values reach the converter in their DB-domain
 * representation rather than their app-domain one — so an element schema with
 * a non-identity encode (e.g. `Schema.NumberFromString`,
 * `FirestoreSchema.ReferenceId`) encodes the sentinel values the same way the
 * plain replace path does. Decode passes the sentinel through unchanged.
 *
 * The element encoder is compiled once, when the field is declared, and the
 * service requirements (`EncodingServices`) of `arraySchema` are preserved.
 */
export const makeArrayUnionInstance = (
  arraySchema: Schema.Top,
): Schema.Codec<ArrayUnion, ArrayUnion, never, unknown> => {
  const encodeValues = SchemaParser.encodeUnknownEffect(arraySchema);
  return ArrayUnionInstance.pipe(
    Schema.decode({
      decode: SchemaGetter.passthrough<ArrayUnion>(),
      encode: SchemaGetter.transformEffect((sentinel: ArrayUnion, options) =>
        Effect.map(
          encodeValues(sentinel.values, options),
          (encodedValues) =>
            new ArrayUnion(encodedValues as readonly unknown[]),
        ),
      ),
    }),
  ) as Schema.Codec<ArrayUnion, ArrayUnion, never, unknown>;
};

/**
 * Build an element-aware `ArrayRemove` schema for a given array element
 * schema. See {@link makeArrayUnionInstance} for the rationale: the sentinel's
 * inner `values` are encoded through `arraySchema` on encode so the converter
 * receives DB-domain values. Decode passes the sentinel through unchanged.
 */
export const makeArrayRemoveInstance = (
  arraySchema: Schema.Top,
): Schema.Codec<ArrayRemove, ArrayRemove, never, unknown> => {
  const encodeValues = SchemaParser.encodeUnknownEffect(arraySchema);
  return ArrayRemoveInstance.pipe(
    Schema.decode({
      decode: SchemaGetter.passthrough<ArrayRemove>(),
      encode: SchemaGetter.transformEffect((sentinel: ArrayRemove, options) =>
        Effect.map(
          encodeValues(sentinel.values, options),
          (encodedValues) =>
            new ArrayRemove(encodedValues as readonly unknown[]),
        ),
      ),
    }),
  ) as Schema.Codec<ArrayRemove, ArrayRemove, never, unknown>;
};

/** Add elements to an array field. */
export const arrayUnion =
  /** Add elements to an array field. */
  (values: readonly unknown[]) => new ArrayUnion(values);

/** Remove elements from an array field. */
export const arrayRemove = (values: readonly unknown[]) =>
  new ArrayRemove(values);
