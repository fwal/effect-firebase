import { Schema } from 'effect';

/**
 * Schema representing a Firestore document data.
 */
export const Data = Schema.Struct(
  {},
  { key: Schema.String, value: Schema.Any }
);
