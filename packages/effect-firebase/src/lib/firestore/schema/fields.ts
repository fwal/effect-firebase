import { Schema } from 'effect';

/**
 * Represents a delete operation. This will remove the field from the document.
 */
export class Delete extends Schema.Class<Delete>('Delete')({}) {}
export const DeleteInstance = Schema.instanceOf(Delete);

/**
 * Represents an arrayUnion operation. This will add elements to an array field.
 * Only valid in the `update` variant — use `WithArraySentinels` to add support to a field.
 */
export class ArrayUnion extends Schema.Class<ArrayUnion>('ArrayUnion')({
  values: Schema.Array(Schema.Unknown),
}) {
  static values(values: readonly unknown[]): ArrayUnion {
    return ArrayUnion.make({ values });
  }
}
export const ArrayUnionInstance = Schema.instanceOf(ArrayUnion);

/**
 * Represents an arrayRemove operation. This will remove elements from an array field.
 * Only valid in the `update` variant — use `WithArraySentinels` to add support to a field.
 */
export class ArrayRemove extends Schema.Class<ArrayRemove>('ArrayRemove')({
  values: Schema.Array(Schema.Unknown),
}) {
  static values(values: readonly unknown[]): ArrayRemove {
    return ArrayRemove.make({ values });
  }
}
export const ArrayRemoveInstance = Schema.instanceOf(ArrayRemove);
