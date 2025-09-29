import { Effect, Layer } from 'effect';
import { FirestoreService, UnexpectedTypeError } from '@effect-firebase/core';
import {
  DocumentReference,
  GeoPoint,
  getFirestore,
  Timestamp,
} from 'firebase-admin/firestore';

export const layer = () =>
  Layer.succeed(FirestoreService, {
    get: (path: string) => {
      return Effect.succeed(getFirestore());
    },
    convertToTimestamp: (date: Date) => {
      return Effect.succeed(Timestamp.fromDate(date));
    },
    convertFromTimestamp: (timestamp: unknown) => {
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
    convertToGeoPoint: (latitude: number, longitude: number) => {
      return Effect.succeed(new GeoPoint(latitude, longitude));
    },
    convertFromGeoPoint: (geoPoint: unknown) => {
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
    convertFromReference: (reference: unknown) => {
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
  });
