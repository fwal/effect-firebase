import {
  arrayRemove,
  arrayUnion,
  deleteField,
  doc,
  DocumentData,
  DocumentReference,
  FieldValue,
  Firestore,
  FirestoreDataConverter,
  GeoPoint,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { FirestoreSchema, FirestoreField } from 'effect-firebase';

/**
 * Encode a value to Firestore client sdk format.
 * @param db The Firestore instance.
 * @param data The value to encode.
 * @returns The encoded value.
 */
export const firestoreEncode = (db: Firestore, data: unknown): unknown => {
  if (
    data === null ||
    data instanceof Timestamp ||
    data instanceof GeoPoint ||
    data instanceof DocumentReference ||
    data instanceof FieldValue
  ) {
    return data;
  }

  if (data instanceof FirestoreSchema.Timestamp) {
    return Timestamp.fromMillis(data.toMillis());
  }
  if (data instanceof FirestoreSchema.GeoPoint) {
    return new GeoPoint(data.latitude, data.longitude);
  }
  if (data instanceof FirestoreSchema.Reference) {
    return doc(db, data.path);
  }
  if (data instanceof FirestoreSchema.ServerTimestamp) {
    return serverTimestamp();
  }
  if (data instanceof FirestoreField.Delete) {
    return deleteField();
  }
  if (data instanceof FirestoreField.ArrayUnion) {
    return arrayUnion(...data.values.map((v) => firestoreEncode(db, v)));
  }
  if (data instanceof FirestoreField.ArrayRemove) {
    return arrayRemove(...data.values.map((v) => firestoreEncode(db, v)));
  }
  if (Array.isArray(data)) {
    return data.map((item) => firestoreEncode(db, item));
  }
  if (typeof data === 'object' && data !== null) {
    // If it's already a Firebase type, leave it alone (optimization)
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, firestoreEncode(db, v)])
    );
  }

  return data;
};

/**
 * Decode a value from Firestore client sdk format.
 * @param data The value to decode.
 * @returns The decoded value.
 */
export const firestoreDecode = (data: DocumentData): DocumentData => {
  if (data instanceof Timestamp) {
    return FirestoreSchema.Timestamp.fromMillis(data.toMillis());
  }
  if (data instanceof GeoPoint) {
    return new FirestoreSchema.GeoPoint({
      latitude: data.latitude,
      longitude: data.longitude,
    });
  }
  if (data instanceof DocumentReference) {
    return FirestoreSchema.Reference.makeFromPath(data.path);
  }
  if (Array.isArray(data)) {
    return data.map(firestoreDecode);
  }
  if (typeof data === 'object' && data !== null) {
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, firestoreDecode(v)])
    );
  }
  return data;
};

export const makeConverter = (
  db: Firestore
): FirestoreDataConverter<DocumentData, DocumentData> => ({
  toFirestore: (modelObject) =>
    firestoreEncode(db, modelObject) as DocumentData,
  fromFirestore: (snapshot) => firestoreDecode(snapshot.data()),
});
