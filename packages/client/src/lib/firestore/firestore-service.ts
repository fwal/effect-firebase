import {
  Cause,
  Context,
  Effect,
  Exit,
  Layer,
  Array as Arr,
  Option,
  Queue,
  Result,
  Stream,
} from 'effect';
import {
  FirestoreError,
  FirestoreService,
  validateCollectionId,
  validateCollectionPath,
  validateDocPath,
} from 'effect-firebase';
import type { FirestoreDataOptions, Snapshot } from 'effect-firebase';
import type { FirebaseApp } from 'firebase/app';
import {
  doc,
  getFirestore,
  type Firestore,
  type Query,
  type Transaction,
  type WriteBatch,
  getDoc,
  getDocs,
  addDoc,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { App, layer as appLayer } from '../app.js';
import { firestoreDecode, makeConverter } from './converter.js';
import { buildCollectionGroupQuery, buildQuery } from './query-builder.js';

const dataOptions = (options?: FirestoreDataOptions) => ({
  serverTimestamps: options?.serverTimestamps ?? 'estimate',
});

/**
 * Fiber-local reference to the currently active transaction. Reads and
 * writes issued while it is set are routed through the transaction, so
 * repositories participate without changes.
 */
const CurrentTransaction = Context.Reference<Option.Option<Transaction>>(
  '@effect-firebase/client/CurrentTransaction',
  { defaultValue: () => Option.none() },
);

/**
 * Fiber-local reference to the currently active write batch. Writes issued
 * while it is set are staged on the batch; reads bypass it.
 */
const CurrentBatch = Context.Reference<Option.Option<WriteBatch>>(
  '@effect-firebase/client/CurrentBatch',
  { defaultValue: () => Option.none() },
);

/**
 * Carries a typed Exit across the `runTransaction` promise boundary, so a
 * failing effect rolls the transaction back without losing its error type.
 */
class EffectFailure {
  constructor(readonly exit: Exit.Exit<unknown, unknown>) {}
}

/**
 * The write-staging surface shared by `Transaction` and `WriteBatch`.
 */
type StagedWriter = Pick<WriteBatch, 'set' | 'update' | 'delete'>;

const make = (db: Firestore) => {
  const converter = makeConverter(db);

  // Writes route through the active transaction first, then the active
  // batch. Both stage writes through the same set/update/delete surface;
  // the Transaction is cast because TypeScript cannot resolve overloads
  // through the Transaction | WriteBatch union.
  const currentWriter: Effect.Effect<Option.Option<StagedWriter>> = Effect.gen(
    function* () {
      const tx = yield* CurrentTransaction;
      if (Option.isSome(tx)) {
        return Option.some(tx.value as unknown as StagedWriter);
      }
      return yield* CurrentBatch;
    },
  );

  const assertNoTransaction = (operation: string) =>
    Effect.flatMap(CurrentTransaction, (tx) =>
      Option.isSome(tx)
        ? Effect.die(
            new Error(
              `FirestoreService.${operation} cannot be used inside withTransaction.`,
            ),
          )
        : Effect.void,
    );

  const packDocSnapshot = (
    snapshot: {
      readonly id: string;
      readonly ref: { readonly path: string };
      readonly data: (options?: {
        readonly serverTimestamps?: 'estimate' | 'previous' | 'none';
      }) => Record<string, unknown> | undefined;
    },
    options?: FirestoreDataOptions,
  ): Option.Option<Snapshot> => {
    const data = snapshot.data(dataOptions(options));
    if (!data) return Option.none();
    return Option.some([
      { id: snapshot.id, path: snapshot.ref.path },
      firestoreDecode(data),
    ]);
  };

  const streamDoc = (path: string, options?: FirestoreDataOptions) =>
    Stream.callback<Option.Option<Snapshot>, FirestoreError>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const docRef = doc(db, path);
          return onSnapshot(
            docRef,
            (snapshot) => {
              const data = snapshot.data(dataOptions(options));
              if (!data) {
                Queue.offerUnsafe(queue, Option.none());
              } else {
                Queue.offerUnsafe(
                  queue,
                  Option.some([
                    { id: snapshot.id, path: snapshot.ref.path },
                    firestoreDecode(data),
                  ] as const),
                );
              }
            },
            (error) => {
              Queue.failCauseUnsafe(
                queue,
                Cause.fail(FirestoreError.fromError(error)),
              );
            },
          );
        }),
        (unsubscribe) => Effect.sync(() => unsubscribe()),
      ),
    );

  const streamQueryOf = (
    makeQuery: () => Query,
    options?: FirestoreDataOptions,
  ) =>
    Stream.callback<ReadonlyArray<Snapshot>, FirestoreError>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const q = makeQuery();
          return onSnapshot(
            q,
            (snapshot) => {
              const snapshots = Arr.filterMap(snapshot.docs, (queryDoc) => {
                const data = queryDoc.data(dataOptions(options));
                if (!data) return Result.failVoid;
                return Result.succeed([
                  { id: queryDoc.id, path: queryDoc.ref.path },
                  firestoreDecode(data),
                ] as const);
              });
              Queue.offerUnsafe(queue, snapshots);
            },
            (error) => {
              Queue.failCauseUnsafe(
                queue,
                Cause.fail(FirestoreError.fromError(error)),
              );
            },
          );
        }),
        (unsubscribe) => Effect.sync(() => unsubscribe()),
      ),
    );

  // The SDK throws synchronously on a malformed collection ID; validating
  // up front turns that into a typed failure for both the effect and the
  // stream, matching the mock. The same holds for full doc/collection paths:
  // a wrong-parity path would otherwise escape as a Cause.die defect (for
  // set/delete/add-writer, which build the ref inside Effect.gen) or stall
  // the stream consumer (for streamDoc/streamQuery, whose ref is built inside
  // Effect.sync under Stream.callback).
  const checkPath = (
    invalid: string | undefined,
  ): Effect.Effect<void, FirestoreError> =>
    invalid === undefined
      ? Effect.void
      : Effect.fail(
          new FirestoreError({
            code: 'invalid-argument',
            name: 'FirestoreError',
            message: invalid,
          }),
        );

  const checkCollectionId = (
    collectionId: string,
  ): Effect.Effect<void, FirestoreError> =>
    checkPath(validateCollectionId(collectionId));

  const checkDocPath = (path: string): Effect.Effect<void, FirestoreError> =>
    checkPath(validateDocPath(path));

  const checkCollectionPath = (
    path: string,
  ): Effect.Effect<void, FirestoreError> =>
    checkPath(validateCollectionPath(path));

  // The client SDK only supports document reads inside transactions.
  const runQuery = (operation: string, makeQuery: () => Query) =>
    assertNoTransaction(operation).pipe(
      Effect.flatMap(() =>
        Effect.tryPromise({
          try: async () => {
            const snapshot = await getDocs(makeQuery());
            return Arr.filterMap(snapshot.docs, (queryDoc) => {
              const data = queryDoc.data();
              if (!data) return Result.failVoid;
              return Result.succeed([
                { id: queryDoc.id, path: queryDoc.ref.path },
                firestoreDecode(data),
              ] as const);
            });
          },
          catch: (error) => FirestoreError.fromError(error),
        }),
      ),
    );

  return FirestoreService.of({
    get: (path, options) =>
      Effect.gen(function* () {
        const tx = yield* CurrentTransaction;
        const snapshot = yield* Effect.tryPromise({
          try: () =>
            Option.isSome(tx)
              ? tx.value.get(doc(db, path))
              : getDoc(doc(db, path)),
          catch: (error) => FirestoreError.fromError(error),
        });
        return packDocSnapshot(snapshot, options);
      }),
    add: (path, data) =>
      Effect.gen(function* () {
        const writer = yield* currentWriter;
        if (Option.isSome(writer)) {
          yield* checkCollectionPath(path);
          const ref = doc(collection(db, path).withConverter(converter));
          yield* Effect.try({
            try: () => void writer.value.set(ref, data),
            catch: (error) => FirestoreError.fromError(error),
          });
          return { id: ref.id, path: ref.path };
        }
        return yield* Effect.tryPromise({
          try: () =>
            addDoc(collection(db, path).withConverter(converter), data),
          catch: (error) => FirestoreError.fromError(error),
        }).pipe(Effect.map((ref) => ({ id: ref.id, path: ref.path })));
      }),
    set: (path, data, options) =>
      Effect.gen(function* () {
        yield* checkDocPath(path);
        const writer = yield* currentWriter;
        const ref = doc(db, path).withConverter(converter);
        if (Option.isSome(writer)) {
          yield* Effect.try({
            try: () =>
              void writer.value.set(ref, data, { merge: options?.merge }),
            catch: (error) => FirestoreError.fromError(error),
          });
          return;
        }
        yield* Effect.tryPromise({
          try: () => setDoc(ref, data, { merge: options?.merge }),
          catch: (error) => FirestoreError.fromError(error),
        });
      }),
    update: (path, data) =>
      Effect.gen(function* () {
        const writer = yield* currentWriter;
        if (Option.isSome(writer)) {
          yield* Effect.try({
            try: () =>
              void writer.value.update(
                doc(db, path),
                converter.toFirestore(data),
              ),
            catch: (error) => FirestoreError.fromError(error),
          });
          return;
        }
        yield* Effect.tryPromise({
          try: () => updateDoc(doc(db, path), converter.toFirestore(data)),
          catch: (error) => FirestoreError.fromError(error),
        });
      }),
    delete: (path) =>
      Effect.gen(function* () {
        yield* checkDocPath(path);
        const writer = yield* currentWriter;
        const ref = doc(db, path).withConverter(converter);
        if (Option.isSome(writer)) {
          yield* Effect.try({
            try: () => void writer.value.delete(ref),
            catch: (error) => FirestoreError.fromError(error),
          });
          return;
        }
        yield* Effect.tryPromise({
          try: () => deleteDoc(ref),
          catch: (error) => FirestoreError.fromError(error),
        });
      }),
    deleteRecursive: (_path) =>
      Effect.die(
        new Error(
          'deleteRecursive is not supported on the client SDK. Use the Admin SDK layer instead.',
        ),
      ),
    query: (collectionPath, constraints) =>
      runQuery('query', () => buildQuery(db, collectionPath, constraints)),
    queryGroup: (collectionId, constraints) =>
      checkCollectionId(collectionId).pipe(
        Effect.flatMap(() =>
          runQuery('queryGroup', () =>
            buildCollectionGroupQuery(db, collectionId, constraints),
          ),
        ),
      ),
    streamDoc: (path, options) =>
      Stream.unwrap(
        assertNoTransaction('streamDoc').pipe(
          Effect.andThen(checkDocPath(path)),
          Effect.map(() => streamDoc(path, options)),
        ),
      ),
    streamQuery: (collectionPath, constraints, options) =>
      Stream.unwrap(
        assertNoTransaction('streamQuery').pipe(
          Effect.andThen(checkCollectionPath(collectionPath)),
          Effect.map(() =>
            streamQueryOf(
              () => buildQuery(db, collectionPath, constraints),
              options,
            ),
          ),
        ),
      ),
    streamQueryGroup: (collectionId, constraints, options) =>
      Stream.unwrap(
        assertNoTransaction('streamQueryGroup').pipe(
          Effect.andThen(checkCollectionId(collectionId)),
          Effect.map(() =>
            streamQueryOf(
              () => buildCollectionGroupQuery(db, collectionId, constraints),
              options,
            ),
          ),
        ),
      ),
    withTransaction: <A, E, R>(self: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        const ambient = yield* CurrentTransaction;
        // Nested transactions join the ambient one.
        if (Option.isSome(ambient)) {
          return yield* self;
        }
        const ambientBatch = yield* CurrentBatch;
        // A transaction cannot join a write batch: batches are write-only, so
        // transactional reads have nowhere to stage, and opening an independent
        // runTransaction here would commit on its own — a silent partial commit
        // if the batch later fails. Reject loudly, consistent with how
        // streamDoc/deleteRecursive reject unsupported combinations.
        if (Option.isSome(ambientBatch)) {
          return yield* Effect.die(
            new Error(
              'FirestoreService.withTransaction cannot be used inside withBatch: ' +
                'a transaction cannot join a write batch. Move the reads/writes out of ' +
                'the batch, or replace withBatch with withTransaction.',
            ),
          );
        }
        const context = yield* Effect.context<R>();
        const exit = yield* Effect.tryPromise({
          try: (signal) =>
            runTransaction(db, (tx) =>
              Effect.runPromiseExit(
                self.pipe(
                  Effect.provideService(CurrentTransaction, Option.some(tx)),
                  Effect.provideContext(context),
                ),
                { signal },
              ).then((exit) => {
                if (Exit.isFailure(exit)) {
                  // Reject so Firestore rolls the transaction back.
                  throw new EffectFailure(exit);
                }
                return exit;
              }),
            ),
          catch: (error) =>
            error instanceof EffectFailure
              ? error
              : FirestoreError.fromError(error),
        }).pipe(
          Effect.catch((error) =>
            error instanceof EffectFailure
              ? Effect.succeed(error.exit as Exit.Exit<A, E>)
              : Effect.fail(error),
          ),
        );
        return yield* exit;
      }),
    withBatch: <A, E, R>(self: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        const tx = yield* CurrentTransaction;
        const ambient = yield* CurrentBatch;
        // Inside a transaction writes are already atomic; nested batches
        // join the ambient one.
        if (Option.isSome(tx) || Option.isSome(ambient)) {
          return yield* self;
        }
        const batch = writeBatch(db);
        const result = yield* self.pipe(
          Effect.provideService(CurrentBatch, Option.some(batch)),
        );
        yield* Effect.tryPromise({
          try: () => batch.commit(),
          catch: (error) => FirestoreError.fromError(error),
        });
        return result;
      }),
  });
};

/**
 * Live Firestore Service using the client SDK.
 */
export const layer = Layer.effect(
  FirestoreService,
  Effect.gen(function* () {
    const app = yield* App;
    return make(getFirestore(app.getApp()));
  }),
);

export const layerFromFirestore = (
  db: Firestore,
): Layer.Layer<FirestoreService, never, never> =>
  Layer.succeed(FirestoreService, make(db));

export const layerFromApp = (
  app: FirebaseApp,
): Layer.Layer<FirestoreService, never, never> =>
  Layer.provide(layer, appLayer(app));
