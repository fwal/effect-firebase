import { Effect, Layer } from 'effect';
import {
  FirestoreError,
  FirestoreService,
  packSnapshot,
  UnexpectedTypeError,
} from 'effect-firebase';
import {
  doc,
  DocumentReference,
  GeoPoint,
  getFirestore,
  Timestamp,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';

export const layer = () =>
  Layer.succeed(FirestoreService, {
    get: (path: string) =>
      Effect.tryPromise({
        try: () => getDoc(doc(getFirestore(), path)),
        catch: FirestoreError.fromError,
      }).pipe(Effect.map(packSnapshot)),
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
  });
