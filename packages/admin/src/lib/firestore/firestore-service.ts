import { Effect, Layer } from 'effect';
import {
  FirestoreError,
  FirestoreService,
  packSnapshot,
  UnexpectedTypeError,
} from 'effect-firebase';
import { UnknownException } from 'effect/Cause';
import {
  DocumentReference,
  GeoPoint,
  getFirestore,
  Timestamp,
} from 'firebase-admin/firestore';
import { FirebaseError } from 'firebase/app';

const mapError = (error: unknown) =>
  error instanceof FirebaseError
    ? FirestoreError.fromError(error)
    : new UnknownException(error as Error);

export const layer = Layer.succeed(
  FirestoreService,
  FirestoreService.of({
    get: (path: string) =>
      Effect.tryPromise({
        try: () => getFirestore().doc(path).get(),
        catch: mapError,
      }).pipe(Effect.map(packSnapshot)),
    convertToTimestamp: (date) => {
      return Effect.succeed(Timestamp.fromDate(date));
    },
    convertFromTimestamp: (timestamp) => {
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
    convertToGeoPoint: (latitude, longitude) => {
      return Effect.succeed(new GeoPoint(latitude, longitude));
    },
    convertFromGeoPoint: (geoPoint) => {
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
    convertFromReference: (reference) => {
      if (reference instanceof DocumentReference) {
        return Effect.succeed({ id: reference.id, path: reference.path });
      }
      return Effect.fail(
        new UnexpectedTypeError({
          expected: 'DocumentReference',
          actual: typeof reference,
        })
      );
    },
    convertToReference: (path: string) => {
      return Effect.succeed(getFirestore().doc(path));
    },
  })
);
