import { Schema } from 'effect';

/**
 * Represents a delete operation. This will remove the field from the document.
 */
export class Delete extends Schema.Class<Delete>('Delete')({}) {}
export const DeleteInstance = Schema.instanceOf(Delete);

export class ArrayAdd extends Schema.Class<ArrayAdd>('ArrayAdd')({}) {}
export const ArrayAddInstance = Schema.instanceOf(ArrayAdd);

export class ArrayRemove extends Schema.Class<ArrayRemove>('ArrayRemove')({}) {}
export const ArrayRemoveInstance = Schema.instanceOf(ArrayRemove);
