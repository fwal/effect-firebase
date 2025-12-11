import { Effect, Schema } from 'effect';
import { fromFirestoreDocumentData } from '../firestore/converter.js';

/**
 * Decodes raw Firestore document data into a typed schema.
 * Handles conversion of Firestore types (Timestamp, GeoPoint, etc.) and optionally injects the document ID.
 *
 * @param rawData - The raw document data from Firestore
 * @param docId - The document ID
 * @param schema - The schema to decode with
 * @param idField - Optional field name to inject the document ID
 * @returns An Effect that resolves to the decoded data
 */
export const decodeDocumentData = <S extends Schema.Schema.Any>(
  rawData: Record<string, unknown> | undefined,
  docId: string | undefined,
  schema: S,
  idField?: string
): Effect.Effect<Schema.Schema.Type<S>, never, Schema.Schema.Context<S>> => {
  const convertedData = fromFirestoreDocumentData(rawData ?? {});
  const dataWithId = idField
    ? { ...convertedData, [idField]: docId }
    : convertedData;
  return Schema.decodeUnknown(schema)(dataWithId).pipe(
    Effect.orDie
  ) as Effect.Effect<Schema.Schema.Type<S>, never, Schema.Schema.Context<S>>;
};
