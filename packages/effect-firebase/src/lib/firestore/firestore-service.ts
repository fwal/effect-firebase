import { Effect, Context, Option, Stream } from 'effect';
import { FirestoreError } from './errors.js';
import { Snapshot } from './snapshot.js';
import { UnknownException } from 'effect/Cause';
import { Data } from './schema/data.js';
import type { QueryConstraint } from './query/constraints.js';

type FirestoreCRUD = {
  /**
   * Get a document from the Firestore database.
   * @param path - The path to the document.
   * @param options - The options for the document.
   * @returns A {@link Snapshot} of the document if it exists, otherwise {@link https://effect.website/docs/data-types/option/#none | Option.none}.
   */
  readonly get: (
    path: string,
    options?: FirestoreDataOptions
  ) => Effect.Effect<
    Option.Option<Snapshot>,
    FirestoreError | UnknownException
  >;

  /**
   * Add a document to the Firestore database.
   * @param path - The path to the document.
   * @param data - The data to add to the document.
   * @returns The ID of the added document.
   */
  readonly add: (
    path: string,
    data: typeof Data.Type
  ) => Effect.Effect<
    { id: string; path: string },
    FirestoreError | UnknownException
  >;

  /**
   * Set a document in the Firestore database.
   * @param path - The path to the document.
   * @param data - The data to set in the document.
   * @param options - The options for the document.
   */
  readonly set: (
    path: string,
    data: typeof Data.Type,
    options?: { merge?: boolean }
  ) => Effect.Effect<void, FirestoreError | UnknownException>;

  /**
   * Update a document in the Firestore database.
   * @param path - The path to the document.
   * @param data - The data to update in the document.
   */
  readonly update: (
    path: string,
    data: typeof Data.Type
  ) => Effect.Effect<void, FirestoreError | UnknownException>;
  readonly remove: (
    path: string
  ) => Effect.Effect<void, FirestoreError | UnknownException>;
};

type FirestoreQuery = {
  /**
   * Query the Firestore database.
   * @param collectionPath - The path to the collection.
   * @param constraints - The constraints to apply to the query.
   * @returns A list of {@link Snapshot}s of the documents in the collection.
   */
  readonly query: (
    collectionPath: string,
    constraints: ReadonlyArray<QueryConstraint>
  ) => Effect.Effect<
    ReadonlyArray<Snapshot>,
    FirestoreError | UnknownException
  >;
};

type FirestoreStreaming = {
  /**
   * Stream a document from the Firestore database.
   * @param path - The path to the document.
   * @param options - The options for the document.
   * @returns A {@link https://effect.website/docs/stream/introduction/ | Stream} of a {@link Snapshot} of a document and any updates to it
   * if it exists, otherwise {@link https://effect.website/docs/data-types/option/#none | Option.none}.
   */
  readonly streamDoc: (
    path: string,
    options?: FirestoreDataOptions
  ) => Stream.Stream<Option.Option<Snapshot>, FirestoreError>;

  /**
   * Stream a query from the Firestore database.
   * @param collectionPath - The path to the collection.
   * @param constraints - The constraints to apply to the query.
   * @param options - The options for the query.
   * @returns A {@link https://effect.website/docs/stream/introduction/ | Stream} of a list of {@link Snapshot}s of the documents in the collection.
   */
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
