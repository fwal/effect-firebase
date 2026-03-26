import {
  DocumentData,
  DocumentReference,
  FieldValue,
  Firestore,
  FirestoreDataConverter,
  GeoPoint,
  Timestamp,
} from 'firebase-admin/firestore';
import { FirestoreSchema, FirestoreField } from 'effect-firebase';

/**
 * Encode a value to Firestore admin sdk format.
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
    return db.doc(data.path);
  }
  if (data instanceof FirestoreSchema.ServerTimestamp) {
    return FieldValue.serverTimestamp();
  }
  if (data instanceof FirestoreField.Delete) {
    return FieldValue.delete();
  }
  if (data instanceof FirestoreField.ArrayUnion) {
    return FieldValue.arrayUnion(
      ...data.values.map((v) => firestoreEncode(db, v))
    );
  }
  if (data instanceof FirestoreField.ArrayRemove) {
    return FieldValue.arrayRemove(
      ...data.values.map((v) => firestoreEncode(db, v))
    );
  }
  if (Array.isArray(data)) {
    return data.map((item) => firestoreEncode(db, item));
  }
  if (typeof data === 'object' && data !== null) {
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, firestoreEncode(db, v)])
    );
  }
  return data;
};

/**
 * Decode a value from Firestore admin sdk format.
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
