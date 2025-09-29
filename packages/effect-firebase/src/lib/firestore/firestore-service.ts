import { Effect, Context, Data } from 'effect';

type FirestoreServiceShape = {
  readonly get: (path: string) => Effect.Effect<any>;

  readonly convertToTimestamp: (date: Date) => Effect.Effect<unknown>;
  readonly convertFromTimestamp: (
    timestamp: unknown
  ) => Effect.Effect<Date, UnexpectedTypeError>;

  readonly convertToGeoPoint: (
    latitude: number,
    longitude: number
  ) => Effect.Effect<unknown>;
  readonly convertFromGeoPoint: (
    geoPoint: unknown
  ) => Effect.Effect<
    { latitude: number; longitude: number },
    UnexpectedTypeError
  >;

  readonly convertFromReference: (
    reference: unknown
  ) => Effect.Effect<{ id: string; path: string }, UnexpectedTypeError>;
  readonly convertToReference: (path: string) => Effect.Effect<unknown>;
};

export class FirestoreService extends Context.Tag(
  '@effect-firebase/FirestoreService'
)<FirestoreService, FirestoreServiceShape>() {}

export class UnexpectedTypeError extends Data.TaggedError(
  'UnexpectedTypeError'
)<{
  expected: 'Timestamp' | 'GeoPoint' | 'DocumentReference';
  actual: string;
}> {}
