import { Schema } from 'effect';

/**
 * Represents a delete operation. This will remove the field from the document.
 */
export class Delete extends Schema.Class<Delete>('Delete')({}) {}
