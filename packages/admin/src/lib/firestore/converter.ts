import {
  DocumentData,
  DocumentReference,
  FieldValue,
  Firestore,
  FirestoreDataConverter,
  GeoPoint,
  Timestamp,
} from 'firebase-admin/firestore';
import { FirestoreSchema } from 'effect-firebase';

export const toFirestoreDocumentData = (
  db: Firestore,
  data: DocumentData
): DocumentData => {
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
  if (Array.isArray(data)) {
    return data.map((item) => toFirestoreDocumentData(db, item));
  }
  if (typeof data === 'object' && data !== null) {
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, toFirestoreDocumentData(db, v)])
    );
  }
  return data;
};

export const fromFirestoreDocumentData = (data: DocumentData): DocumentData => {
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
    return data.map(fromFirestoreDocumentData);
  }
  if (typeof data === 'object' && data !== null) {
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, fromFirestoreDocumentData(v)])
    );
  }
  return data;
};

export const makeConverter = (
  db: Firestore
): FirestoreDataConverter<DocumentData, DocumentData> => ({
  toFirestore: (modelObject) => toFirestoreDocumentData(db, modelObject),
  fromFirestore: (snapshot) => fromFirestoreDocumentData(snapshot.data()),
});
