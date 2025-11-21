import { Effect, Context, Option } from 'effect';
import { FirestoreError, UnexpectedTypeError } from './errors.js';
import { Snapshot } from './snapshot.js';
import { UnknownException } from 'effect/Cause';

type FirestoreConverters = {
  readonly convertToTimestamp: (date: Date) => Effect.Effect<unknown>;
  readonly convertFromTimestamp: (
    timestamp: unknown
  ) => Effect.Effect<Date, UnexpectedTypeError>;
  readonly serverTimestamp: () => Effect.Effect<unknown>;

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

type FirestoreCRUD = {
  readonly get: (
    path: string
  ) => Effect.Effect<
    Option.Option<Snapshot>,
    FirestoreError | UnknownException
  >;
  readonly add: (
    path: string,
    data: unknown
  ) => Effect.Effect<
    { id: string; path: string },
    FirestoreError | UnknownException
  >;
  readonly set: (
    path: string,
    data: unknown,
    options?: { merge?: boolean }
  ) => Effect.Effect<void, FirestoreError | UnknownException>;
  readonly update: (
    path: string,
    data: unknown
  ) => Effect.Effect<void, FirestoreError | UnknownException>;
  readonly remove: (
    path: string
  ) => Effect.Effect<void, FirestoreError | UnknownException>;
};

export type FirestoreServiceShape = FirestoreConverters & FirestoreCRUD;

export class FirestoreService extends Context.Tag(
  '@effect-firebase/FirestoreService'
)<FirestoreService, FirestoreServiceShape>() {}
