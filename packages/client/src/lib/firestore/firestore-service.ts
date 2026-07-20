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
import { FirestoreError, FirestoreService } from 'effect-firebase';
import type { FirestoreDataOptions, Snapshot } from 'effect-firebase';
import type { FirebaseApp } from 'firebase/app';
import {
  doc,
  getFirestore,
  type Firestore,
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
import { buildQuery } from './query-builder.js';

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
  { defaultValue: () => Option.none() }
);

/**
 * Fiber-local reference to the currently active write batch. Writes issued
 * while it is set are staged on the batch; reads bypass it.
 */
const CurrentBatch = Context.Reference<Option.Option<WriteBatch>>(
  '@effect-firebase/client/CurrentBatch',
  { defaultValue: () => Option.none() }
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
    }
  );

  const assertNoTransaction = (operation: string) =>
    Effect.flatMap(CurrentTransaction, (tx) =>
      Option.isSome(tx)
        ? Effect.die(
            new Error(
              `FirestoreService.${operation} cannot be used inside withTransaction.`
            )
          )
        : Effect.void
    );

  const packDocSnapshot = (
    snapshot: {
      readonly id: string;
      readonly ref: { readonly path: string };
      readonly data: (options?: {
        readonly serverTimestamps?: 'estimate' | 'previous' | 'none';
      }) => Record<string, unknown> | undefined;
    },
    options?: FirestoreDataOptions
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
                  ] as const)
                );
              }
            },
            (error) => {
              Queue.failCauseUnsafe(
                queue,
                Cause.fail(FirestoreError.fromError(error))
              );
            }
          );
        }),
        (unsubscribe) => Effect.sync(() => unsubscribe())
      )
    );

  const streamQuery = (
    collectionPath: string,
    constraints: Parameters<typeof buildQuery>[2],
    options?: FirestoreDataOptions
  ) =>
    Stream.callback<ReadonlyArray<Snapshot>, FirestoreError>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const q = buildQuery(db, collectionPath, constraints);
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
                Cause.fail(FirestoreError.fromError(error))
              );
            }
          );
        }),
        (unsubscribe) => Effect.sync(() => unsubscribe())
      )
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
                converter.toFirestore(data)
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
          'deleteRecursive is not supported on the client SDK. Use the Admin SDK layer instead.'
        )
      ),
    query: (collectionPath, constraints) =>
      // The client SDK only supports document reads inside transactions.
      assertNoTransaction('query').pipe(
        Effect.flatMap(() =>
          Effect.tryPromise({
            try: async () => {
              const q = buildQuery(db, collectionPath, constraints);
              const snapshot = await getDocs(q);
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
          })
        )
      ),
    streamDoc: (path, options) =>
      Stream.unwrap(
        assertNoTransaction('streamDoc').pipe(
          Effect.map(() => streamDoc(path, options))
        )
      ),
    streamQuery: (collectionPath, constraints, options) =>
      Stream.unwrap(
        assertNoTransaction('streamQuery').pipe(
          Effect.map(() => streamQuery(collectionPath, constraints, options))
        )
      ),
    withTransaction: <A, E, R>(self: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        const ambient = yield* CurrentTransaction;
        // Nested transactions join the ambient one.
        if (Option.isSome(ambient)) {
          return yield* self;
        }
        const context = yield* Effect.context<R>();
        const exit = yield* Effect.tryPromise({
          try: (signal) =>
            runTransaction(db, (tx) =>
              Effect.runPromiseExit(
                self.pipe(
                  Effect.provideService(CurrentTransaction, Option.some(tx)),
                  Effect.provideContext(context)
                ),
                { signal }
              ).then((exit) => {
                if (Exit.isFailure(exit)) {
                  // Reject so Firestore rolls the transaction back.
                  throw new EffectFailure(exit);
                }
                return exit;
              })
            ),
          catch: (error) =>
            error instanceof EffectFailure
              ? error
              : FirestoreError.fromError(error),
        }).pipe(
          Effect.catch((error) =>
            error instanceof EffectFailure
              ? Effect.succeed(error.exit as Exit.Exit<A, E>)
              : Effect.fail(error)
          )
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
          Effect.provideService(CurrentBatch, Option.some(batch))
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
  })
);

export const layerFromFirestore = (
  db: Firestore
): Layer.Layer<FirestoreService, never, never> =>
  Layer.succeed(FirestoreService, make(db));

export const layerFromApp = (
  app: FirebaseApp
): Layer.Layer<FirestoreService, never, never> =>
  Layer.provide(layer, appLayer(app));
