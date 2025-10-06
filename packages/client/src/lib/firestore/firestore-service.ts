import { Effect, Layer } from 'effect';
import { FirestoreService, UnexpectedTypeError } from 'effect-firebase';
import { doc, DocumentReference, GeoPoint, getFirestore, Timestamp } from 'firebase/firestore';

export const layer = () =>
  Layer.succeed(FirestoreService, {
    get: (path: string) => {
      return Effect.succeed(getFirestore());
    },
    convertToTimestamp: function (date: Date): Effect.Effect<unknown> {
      return Effect.succeed(Timestamp.fromDate(date));
    },
    convertFromTimestamp: function (timestamp: unknown): Effect.Effect<Date, UnexpectedTypeError> {
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
    convertToGeoPoint: function (latitude: number, longitude: number): Effect.Effect<unknown> {
      return Effect.succeed(new GeoPoint(latitude, longitude));
    },
    convertFromGeoPoint: function (geoPoint: unknown): Effect.Effect<{ latitude: number; longitude: number; }, UnexpectedTypeError> {
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
    convertFromReference: function (reference: unknown): Effect.Effect<{ id: string; path: string; }, UnexpectedTypeError> {
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
    }
  });
