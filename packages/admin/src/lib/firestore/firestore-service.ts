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
  makeSnapshotPacker,
} from 'effect-firebase';
import type { App as FirebaseAdminApp } from 'firebase-admin/app';
import type { Snapshot } from 'effect-firebase';
import { UnknownError } from 'effect/Cause';
import {
  getFirestore,
  type Firestore,
  type Transaction,
  type WriteBatch,
} from 'firebase-admin/firestore';
import { App } from '../app.js';
import { firestoreDecode, makeConverter } from './converter.js';
import { buildQuery } from './query-builder.js';

const packSnapshot = makeSnapshotPacker(firestoreDecode);

/**
 * Fiber-local reference to the currently active transaction. Reads and
 * writes issued while it is set are routed through the transaction, so
 * repositories participate without changes.
 */
const CurrentTransaction = Context.Reference<Option.Option<Transaction>>(
  '@effect-firebase/admin/CurrentTransaction',
  { defaultValue: () => Option.none() }
);

/**
 * Fiber-local reference to the currently active write batch. Writes issued
 * while it is set are staged on the batch; reads bypass it.
 */
const CurrentBatch = Context.Reference<Option.Option<WriteBatch>>(
  '@effect-firebase/admin/CurrentBatch',
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
type StagedWriter = Pick<WriteBatch, 'create' | 'set' | 'update' | 'delete'>;

const mapError = (error: unknown) =>
  error instanceof Error
    ? FirestoreError.fromError(error)
    : new UnknownError(error);

const isInvalidCredentialError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    'code' in error &&
    (error as { code?: string }).code === 'firestore/invalid-credential'
  );
};

const isApplicationDefaultCredential = (
  credential: unknown
): credential is { constructor: { name: string } } => {
  if (typeof credential !== 'object' || credential === null) {
    return false;
  }

  if (!('constructor' in credential)) {
    return false;
  }

  return (
    'name' in credential.constructor &&
    typeof credential.constructor.name === 'string' &&
    (credential.constructor.name === 'ApplicationDefaultCredential' ||
      credential.constructor.name === 'RefreshTokenCredential')
  );
};

const buildDuplicateFirebaseAdminError = (error: Error): Error =>
  new Error(
    [
      error.message,
      'Detected Application Default Credentials on the app, but Firestore rejected them.',
      'This usually means multiple firebase-admin copies are loaded.',
      'Ensure firebase-admin is deduped in your deployment and create both initializeApp() and getFirestore() from the same firebase-admin package instance.',
      'Alternatively, use Admin.layer({ firestore: getFirestore(app) }) to provide a Firestore instance directly.',
    ].join(' '),
    { cause: error }
  );

const getFirestoreFromApp = (app: FirebaseAdminApp): Firestore => {
  try {
    return getFirestore(app);
  } catch (error) {
    if (
      error instanceof Error &&
      isInvalidCredentialError(error) &&
      isApplicationDefaultCredential(app.options.credential)
    ) {
      throw buildDuplicateFirebaseAdminError(error);
    }

    throw error;
  }
};

const make = (db: Firestore) => {
  const converter = makeConverter(db);

  // Writes route through the active transaction first, then the active
  // batch. Both stage writes through the same create/set/update/delete
  // surface; the Transaction is cast because TypeScript cannot resolve
  // overloads through the Transaction | WriteBatch union.
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

  const assertNoWriter = (operation: string) =>
    Effect.flatMap(currentWriter, (writer) =>
      Option.isSome(writer)
        ? Effect.die(
            new Error(
              `FirestoreService.${operation} cannot be used inside withTransaction or withBatch.`
            )
          )
        : Effect.void
    );

  const streamDoc = (
    path: string,
    options?: Parameters<typeof packSnapshot>[1]
  ) =>
    Stream.callback<Option.Option<Snapshot>, FirestoreError>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const docRef = db.doc(path);
          return docRef.onSnapshot(
            (snapshot) => {
              Queue.offerUnsafe(queue, packSnapshot(snapshot, options));
            },
            (error) => {
              const mappedError = mapError(error);
              if (mappedError._tag === 'FirestoreError') {
                Queue.failCauseUnsafe(queue, Cause.fail(mappedError));
              } else {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(FirestoreError.fromError(error as Error))
                );
              }
            }
          );
        }),
        (unsubscribe) => Effect.sync(() => unsubscribe())
      )
    );

  const streamQuery = (
    collectionPath: string,
    constraints: Parameters<typeof buildQuery>[2],
    options?: Parameters<typeof packSnapshot>[1]
  ) =>
    Stream.callback<ReadonlyArray<Snapshot>, FirestoreError>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const query = buildQuery(db, collectionPath, constraints);
          return query.onSnapshot(
            (snapshot) => {
              const snapshots = Arr.filterMap(snapshot.docs, (doc) =>
                Result.fromOption(packSnapshot(doc, options), () => void 0)
              );
              Queue.offerUnsafe(queue, snapshots);
            },
            (error) => {
              const mappedError = mapError(error);
              if (mappedError._tag === 'FirestoreError') {
                Queue.failCauseUnsafe(queue, Cause.fail(mappedError));
              } else {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(FirestoreError.fromError(error as Error))
                );
              }
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
            Option.isSome(tx) ? tx.value.get(db.doc(path)) : db.doc(path).get(),
          catch: (error) => mapError(error),
        });
        return packSnapshot(snapshot, options);
      }),
    add: (path, data) =>
      Effect.gen(function* () {
        const writer = yield* currentWriter;
        if (Option.isSome(writer)) {
          const ref = db.collection(path).withConverter(converter).doc();
          yield* Effect.try({
            try: () => writer.value.create(ref, data),
            catch: (error) => mapError(error),
          });
          return { id: ref.id, path: ref.path };
        }
        return yield* Effect.tryPromise({
          try: async () => {
            const ref = await db
              .collection(path)
              .withConverter(converter)
              .add(data);
            return { id: ref.id, path: ref.path };
          },
          catch: (error) => mapError(error),
        });
      }),
    set: (path, data, options) =>
      Effect.gen(function* () {
        const writer = yield* currentWriter;
        const ref = db.doc(path).withConverter(converter);
        if (Option.isSome(writer)) {
          yield* Effect.try({
            try: () => writer.value.set(ref, data, options || {}),
            catch: (error) => mapError(error),
          });
          return;
        }
        yield* Effect.tryPromise({
          try: () => ref.set(data, options || {}),
          catch: (error) => mapError(error),
        });
      }),
    update: (path, data) =>
      Effect.gen(function* () {
        const writer = yield* currentWriter;
        if (Option.isSome(writer)) {
          yield* Effect.try({
            try: () =>
              writer.value.update(db.doc(path), converter.toFirestore(data)),
            catch: (error) => mapError(error),
          });
          return;
        }
        yield* Effect.tryPromise({
          try: () => db.doc(path).update(converter.toFirestore(data)),
          catch: (error) => mapError(error),
        });
      }),
    delete: (path) =>
      Effect.gen(function* () {
        const writer = yield* currentWriter;
        const ref = db.doc(path).withConverter(converter);
        if (Option.isSome(writer)) {
          yield* Effect.try({
            try: () => void writer.value.delete(ref),
            catch: (error) => mapError(error),
          });
          return;
        }
        yield* Effect.tryPromise({
          try: () => ref.delete(),
          catch: (error) => mapError(error),
        });
      }),
    deleteRecursive: (path) =>
      assertNoWriter('deleteRecursive').pipe(
        Effect.flatMap(() =>
          Effect.tryPromise({
            try: () => db.recursiveDelete(db.doc(path)),
            catch: (error) => mapError(error),
          })
        )
      ),
    query: (collectionPath, constraints) =>
      Effect.gen(function* () {
        const tx = yield* CurrentTransaction;
        const snapshot = yield* Effect.tryPromise({
          try: () => {
            const query = buildQuery(db, collectionPath, constraints);
            return Option.isSome(tx) ? tx.value.get(query) : query.get();
          },
          catch: (error) => mapError(error),
        });
        return Arr.filterMap(snapshot.docs, (doc) =>
          Result.fromOption(packSnapshot(doc), () => void 0)
        );
      }),
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
            db.runTransaction((tx) =>
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
            error instanceof EffectFailure ? error : mapError(error),
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
        const batch = db.batch();
        const result = yield* self.pipe(
          Effect.provideService(CurrentBatch, Option.some(batch))
        );
        yield* Effect.tryPromise({
          try: () => batch.commit(),
          catch: (error) => mapError(error),
        });
        return result;
      }),
  });
};

export const layerFromFirestore = (
  db: Firestore
): Layer.Layer<FirestoreService> => Layer.succeed(FirestoreService, make(db));

/**
 * Live Firestore service using the admin SDK.
 */
export const layer = Layer.effect(
  FirestoreService,
  Effect.gen(function* () {
    const app = yield* App;
    return make(getFirestoreFromApp(app.getApp()));
  })
);
