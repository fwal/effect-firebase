import { DateTime, Effect, Layer } from 'effect';
import {
  FirestoreService,
  FirestoreServiceShape,
  UnexpectedTypeError,
} from 'effect-firebase';
import { MockTimestamp } from './types/timestamp.js';
import { MockGeoPoint } from './types/geopoint.js';
import { MockReference } from './types/reference.js';

export const MockFirestoreService = (
  overrides: Partial<FirestoreServiceShape> = {}
) =>
  Layer.succeed(FirestoreService, {
    get: () => {
      throw new Error('Function not implemented.');
    },
    add: () => {
      throw new Error('Function not implemented.');
    },
    set: () => {
      throw new Error('Function not implemented.');
    },
    update: () => {
      throw new Error('Function not implemented.');
    },
    remove: () => {
      throw new Error('Function not implemented.');
    },
    convertToTimestamp: (date) => {
      return Effect.succeed(MockTimestamp.fromMillis(date.epochMillis));
    },
    convertFromTimestamp: (timestamp) => {
      if (timestamp instanceof MockTimestamp) {
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
      return Effect.succeed(MockTimestamp.now());
    },
    convertToGeoPoint: (latitude, longitude) => {
      return Effect.succeed(new MockGeoPoint(latitude, longitude));
    },
    convertFromGeoPoint: (geoPoint) => {
      if (geoPoint instanceof MockGeoPoint) {
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
      if (reference instanceof MockReference) {
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
    convertToReference: (path) => {
      const id = path.split('/').pop() ?? '';
      return Effect.succeed(new MockReference(id, path));
    },
    ...overrides,
  });
