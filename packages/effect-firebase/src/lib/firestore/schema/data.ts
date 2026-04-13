import { Schema } from 'effect';

/**
 * Schema representing a Firestore document data.
 */
export const Data = Schema.Record(Schema.String, Schema.Unknown);
