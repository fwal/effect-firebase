import { Schema } from 'effect';

/**
 * Represents a delete operation. This will remove the field from the document.
 */
export class Delete {}
export const DeleteInstance = Schema.instanceOf(Delete);

const _delete = () => new Delete();
export {
  /** Delete the field, removing it from the document. */
  _delete as delete,
};
