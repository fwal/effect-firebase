import { Effect, Context, Option } from 'effect';
import { FirestoreError } from './errors.js';
import { Snapshot } from './snapshot.js';
import { UnknownException } from 'effect/Cause';
import { Data } from './schema/data.js';

type FirestoreCRUD = {
  readonly get: (
    path: string
  ) => Effect.Effect<
    Option.Option<Snapshot>,
    FirestoreError | UnknownException
  >;
  readonly add: (
    path: string,
    data: typeof Data.Type
  ) => Effect.Effect<
    { id: string; path: string },
    FirestoreError | UnknownException
  >;
  readonly set: (
    path: string,
    data: typeof Data.Type,
    options?: { merge?: boolean }
  ) => Effect.Effect<void, FirestoreError | UnknownException>;
  readonly update: (
    path: string,
    data: typeof Data.Type
  ) => Effect.Effect<void, FirestoreError | UnknownException>;
  readonly remove: (
    path: string
  ) => Effect.Effect<void, FirestoreError | UnknownException>;
};

export type FirestoreServiceShape = FirestoreCRUD;

export class FirestoreService extends Context.Tag(
  '@effect-firebase/FirestoreService'
)<FirestoreService, FirestoreServiceShape>() {}
