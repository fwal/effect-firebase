import { Effect, Context, Option, Stream } from 'effect';
import { FirestoreError } from './errors.js';
import { Snapshot } from './snapshot.js';
import { UnknownError } from 'effect/Cause';
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
  ) => Effect.Effect<Option.Option<Snapshot>, FirestoreError | UnknownError>;

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
    FirestoreError | UnknownError
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
  ) => Effect.Effect<void, FirestoreError | UnknownError>;

  /**
   * Update a document in the Firestore database.
   * @param path - The path to the document.
   * @param data - The data to update in the document.
   */
  readonly update: (
    path: string,
    data: typeof Data.Type
  ) => Effect.Effect<void, FirestoreError | UnknownError>;

  /**
   * Delete a document from the Firestore database.
   * @param path - The path to the document.
   */
  readonly delete: (
    path: string
  ) => Effect.Effect<void, FirestoreError | UnknownError>;

  /**
   * Recursively delete a document and all its subcollections.
   *
   * **Admin SDK only.** Calling this method with the client SDK layer will
   * cause a defect (`Effect.die`). Repositories and models that use this
   * method must only be run in an admin context.
   *
   * @param path - The path to the document.
   */
  readonly deleteRecursive: (
    path: string
  ) => Effect.Effect<void, FirestoreError | UnknownError>;
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
  ) => Effect.Effect<ReadonlyArray<Snapshot>, FirestoreError | UnknownError>;
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

type FirestoreTransactions = {
  /**
   * Run an effect inside a Firestore transaction.
   *
   * Every {@link FirestoreService} read and write performed by the effect —
   * including reads and writes made through repositories — is routed through
   * the transaction. The transaction commits when the effect succeeds and
   * rolls back when it fails.
   *
   * Semantics and caveats:
   * - The SDK may retry the transaction on contention, re-running the effect.
   *   The effect must therefore be safe to run more than once; non-Firestore
   *   side effects inside it (logging, HTTP calls, ...) can execute multiple
   *   times.
   * - Firestore requires all transactional reads to happen before the first
   *   write. Violations surface as a {@link FirestoreError} at runtime.
   * - Nested `withTransaction` calls join the ambient transaction instead of
   *   starting a new one.
   * - `streamDoc`, `streamQuery`, and `deleteRecursive` cannot participate in
   *   a transaction and cause a defect (`Effect.die`) when used inside one.
   * - With the client SDK, `query` is not supported inside a transaction
   *   (only document reads are) and causes a defect.
   * - Forked fibers must not outlive the transaction; all transactional work
   *   has to complete before the effect finishes.
   *
   * @param self - The effect to run inside the transaction.
   * @returns The result of the effect after the transaction has committed.
   */
  readonly withTransaction: <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | FirestoreError | UnknownError, R>;

  /**
   * Run an effect inside a Firestore write batch.
   *
   * Every {@link FirestoreService} write performed by the effect — including
   * writes made through repositories — is staged on the batch and committed
   * atomically when the effect succeeds. When the effect fails, nothing is
   * committed.
   *
   * Semantics and caveats:
   * - Batches are write-only. Reads (`get`, `query`, streams) inside the
   *   effect execute immediately against the database and do not observe the
   *   staged writes.
   * - A batch supports at most 500 write operations.
   * - Nested `withBatch` calls join the ambient batch. Inside an ambient
   *   transaction, `withBatch` is a no-op wrapper: writes are already atomic
   *   through the transaction.
   * - `deleteRecursive` cannot participate in a batch and causes a defect
   *   (`Effect.die`) when used inside one.
   *
   * @param self - The effect to run inside the batch.
   * @returns The result of the effect after the batch has committed.
   */
  readonly withBatch: <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | FirestoreError | UnknownError, R>;
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
  FirestoreStreaming &
  FirestoreTransactions;

export class FirestoreService extends Context.Service<
  FirestoreService,
  FirestoreServiceShape
>()('@effect-firebase/FirestoreService') {}
