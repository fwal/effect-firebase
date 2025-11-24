import { Schema } from 'effect';

/**
 * Class representing a Reference in Firestore.
 */
export class DocumentReference extends Schema.Class<DocumentReference>(
  'DocumentReference'
)({
  id: Schema.String,
  path: Schema.String,
}) {}
