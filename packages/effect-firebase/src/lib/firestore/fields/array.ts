import { Schema } from 'effect';

/**
 * Represents an arrayUnion operation. This will add elements to an array field.
 * Only valid in the `update` variant — use `WithArraySentinels` to add support to a field.
 */
export class ArrayUnion {
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
export class ArrayRemove {
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

/** Add elements to an array field. */
export const arrayUnion =
  /** Add elements to an array field. */
  (values: readonly unknown[]) => new ArrayUnion(values);

/** Remove elements from an array field. */
export const arrayRemove = (values: readonly unknown[]) =>
  new ArrayRemove(values);
