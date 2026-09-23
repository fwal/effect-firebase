import { Schema, SchemaGetter } from 'effect';

/**
 * Represents a delete operation. This will remove the field from the document.
 */
export class Delete {}
export const DeleteInstance = Schema.instanceOf(Delete, {
  representation: { id: 'effect-firebase/Delete', payload: null },
  toCodecJson: () =>
    Schema.link<Delete>()(Schema.Struct({ _tag: Schema.Literal('Delete') }), {
      decode: SchemaGetter.transform(() => new Delete()),
      encode: SchemaGetter.transform(() => ({ _tag: 'Delete' as const })),
    }),
});

const _delete = () => new Delete();
export {
  /** Delete the field, removing it from the document. */
  _delete as delete,
};
