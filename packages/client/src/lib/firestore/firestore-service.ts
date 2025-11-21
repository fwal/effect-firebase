import { Effect, Layer } from 'effect';
import {
  FirestoreError,
  FirestoreService,
  packSnapshot,
  UnexpectedTypeError,
} from 'effect-firebase';
import { UnknownException } from 'effect/Cause';
import {
  doc,
  DocumentReference,
  GeoPoint,
  getFirestore,
  Timestamp,
  getDoc,
  serverTimestamp,
  addDoc,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';

export const layer = () =>
  Layer.succeed(FirestoreService, {
    convertToTimestamp: function (date: Date): Effect.Effect<unknown> {
      return Effect.succeed(Timestamp.fromDate(date));
    },
    convertFromTimestamp: function (
      timestamp: unknown
    ): Effect.Effect<Date, UnexpectedTypeError> {
      if (timestamp instanceof Timestamp) {
        return Effect.succeed(timestamp.toDate());
      }
      return Effect.fail(
        new UnexpectedTypeError({
          expected: 'Timestamp',
          actual: typeof timestamp,
        })
      );
    },
    serverTimestamp: () => {
      return Effect.succeed(serverTimestamp());
    },
    convertToGeoPoint: function (
      latitude: number,
      longitude: number
    ): Effect.Effect<unknown> {
      return Effect.succeed(new GeoPoint(latitude, longitude));
    },
    convertFromGeoPoint: function (
      geoPoint: unknown
    ): Effect.Effect<
      { latitude: number; longitude: number },
      UnexpectedTypeError
    > {
      if (geoPoint instanceof GeoPoint) {
        return Effect.succeed({
          latitude: geoPoint.latitude,
          longitude: geoPoint.longitude,
        });
      }
      return Effect.fail(
        new UnexpectedTypeError({
          expected: 'GeoPoint',
          actual: typeof geoPoint,
        })
      );
    },
    convertFromReference: function (
      reference: unknown
    ): Effect.Effect<{ id: string; path: string }, UnexpectedTypeError> {
      if (reference instanceof DocumentReference) {
        return Effect.succeed({
          id: reference.id,
          path: reference.path,
        });
      }
      return Effect.fail(
        new UnexpectedTypeError({
          expected: 'DocumentReference',
          actual: typeof reference,
        })
      );
    },
    convertToReference: function (path: string): Effect.Effect<unknown> {
      return Effect.succeed(doc(getFirestore(), path));
    },
    get: (path: string) =>
      Effect.tryPromise({
        try: () => getDoc(doc(getFirestore(), path)),
        catch: FirestoreError.fromError,
      }).pipe(Effect.map(packSnapshot)),
    add: function (
      path: string,
      data: unknown
    ): Effect.Effect<
      { id: string; path: string },
      FirestoreError | UnknownException
    > {
      return Effect.tryPromise({
        try: () => addDoc(collection(getFirestore(), path), data),
        catch: FirestoreError.fromError,
      }).pipe(Effect.map((ref) => ({ id: ref.id, path: ref.path })));
    },
    set: function (
      path: string,
      data: unknown,
      options?: { merge?: boolean }
    ): Effect.Effect<void, FirestoreError | UnknownException> {
      return Effect.tryPromise({
        try: () =>
          setDoc(doc(getFirestore(), path), data as Partial<unknown>, {
            merge: options?.merge,
          }),
        catch: FirestoreError.fromError,
      });
    },
    update: function (
      path: string,
      data: unknown
    ): Effect.Effect<void, FirestoreError | UnknownException> {
      return Effect.tryPromise({
        try: () =>
          updateDoc(doc(getFirestore(), path), data as Partial<unknown>),
        catch: FirestoreError.fromError,
      });
    },
    remove: function (
      path: string
    ): Effect.Effect<void, FirestoreError | UnknownException> {
      return Effect.tryPromise({
        try: () => deleteDoc(doc(getFirestore(), path)),
        catch: FirestoreError.fromError,
      });
    },
  });
