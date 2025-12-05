import {
  doc,
  DocumentData,
  DocumentReference,
  FieldValue,
  FirestoreDataConverter,
  GeoPoint,
  getFirestore,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { FirestoreSchema } from 'effect-firebase';

export const toFirestoreDocumentData = (data: DocumentData): DocumentData => {
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
    return doc(getFirestore(), data.path);
  }
  if (data instanceof FirestoreSchema.ServerTimestamp) {
    return serverTimestamp();
  }
  if (Array.isArray(data)) {
    return data.map(toFirestoreDocumentData);
  }
  if (typeof data === 'object' && data !== null) {
    // If it's already a Firebase type, leave it alone (optimization)
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, toFirestoreDocumentData(v)])
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

export const converter: FirestoreDataConverter<DocumentData, DocumentData> = {
  toFirestore: (modelObject) => toFirestoreDocumentData(modelObject),
  fromFirestore: (snapshot) => fromFirestoreDocumentData(snapshot.data()),
};
