import { Effect, Context, Option, Stream } from 'effect';
import { FirestoreError } from './errors.js';
import { Snapshot } from './snapshot.js';
import { UnknownException } from 'effect/Cause';
import { Data } from './schema/data.js';
import type { QueryConstraint } from './query/constraints.js';

type FirestoreCRUD = {
  readonly get: (
    path: string,
    options?: FirestoreDataOptions
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

type FirestoreQuery = {
  readonly query: (
    collectionPath: string,
    constraints: ReadonlyArray<QueryConstraint>
  ) => Effect.Effect<
    ReadonlyArray<Snapshot>,
    FirestoreError | UnknownException
  >;
};

type FirestoreStreaming = {
  readonly streamDoc: (
    path: string,
    options?: FirestoreDataOptions
  ) => Stream.Stream<Option.Option<Snapshot>, FirestoreError>;
  readonly streamQuery: (
    collectionPath: string,
    constraints: ReadonlyArray<QueryConstraint>,
    options?: FirestoreDataOptions
  ) => Stream.Stream<ReadonlyArray<Snapshot>, FirestoreError>;
};

export interface FirestoreDataOptions {
  /**
   * Controls how intermediate server timestamps are handled on the client when writing data.
   * - 'estimate': Use the local client's estimated timestamp.
   * - 'previous': Use the previous server timestamp.
   * - 'none': Use `null` until server has responded with a timestamp.
   * @default 'estimate'
   */
  readonly serverTimestamps?: 'estimate' | 'previous' | 'none';
}

export type FirestoreServiceShape = FirestoreCRUD &
  FirestoreQuery &
  FirestoreStreaming;

export class FirestoreService extends Context.Tag(
  '@effect-firebase/FirestoreService'
)<FirestoreService, FirestoreServiceShape>() {}
