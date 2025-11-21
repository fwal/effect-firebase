import { Effect, Layer, DateTime } from 'effect';
import {
  FirestoreError,
  FirestoreService,
  packSnapshot,
  UnexpectedTypeError,
} from 'effect-firebase';
import { UnknownException } from 'effect/Cause';
import {
  DocumentReference,
  FieldValue,
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
    add: (path: string, data: unknown) =>
      Effect.tryPromise({
        try: async () => {
          const ref = await getFirestore()
            .collection(path)
            .add(data as any);
          return { id: ref.id, path: ref.path };
        },
        catch: mapError,
      }),
    set: (path: string, data: unknown, options) =>
      Effect.tryPromise({
        try: () =>
          getFirestore()
            .doc(path)
            .set(data as any, options || {}),
        catch: mapError,
      }),
    update: (path: string, data: unknown) =>
      Effect.tryPromise({
        try: () =>
          getFirestore()
            .doc(path)
            .update(data as any),
        catch: mapError,
      }),
    remove: (path: string) =>
      Effect.tryPromise({
        try: () => getFirestore().doc(path).delete(),
        catch: mapError,
      }),
    convertToTimestamp: (date) => {
      return Effect.succeed(Timestamp.fromMillis(date.epochMillis));
    },
    convertFromTimestamp: (timestamp) => {
      if (timestamp instanceof Timestamp) {
        return Effect.succeed(DateTime.unsafeMake(timestamp.toMillis()));
      }
      return Effect.fail(
        new UnexpectedTypeError({
          expected: 'Timestamp',
          actual: typeof timestamp,
        })
      );
    },
    serverTimestamp: () => {
      return Effect.succeed(FieldValue.serverTimestamp());
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
