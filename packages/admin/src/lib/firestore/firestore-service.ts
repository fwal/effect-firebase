import { Effect, Layer, Array as Arr, Option, Stream } from 'effect';
import {
  FirestoreError,
  FirestoreService,
  makeSnapshotPacker,
} from 'effect-firebase';
import type { App as FirebaseAdminApp } from 'firebase-admin/app';
import type { Snapshot } from 'effect-firebase';
import { UnknownException } from 'effect/Cause';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { App } from '../app.js';
import { fromFirestoreDocumentData, makeConverter } from './converter.js';
import { buildQuery } from './query-builder.js';

const packSnapshot = makeSnapshotPacker(fromFirestoreDocumentData);

const mapError = (error: unknown) =>
  error instanceof Error
    ? FirestoreError.fromError(error)
    : new UnknownException(error);

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

  return FirestoreService.of({
    get: (path, options) =>
      Effect.tryPromise({
        try: () => db.doc(path).get(),
        catch: (error) => mapError(error),
      }).pipe(Effect.map((snapshot) => packSnapshot(snapshot, options))),
    add: (path, data) =>
      Effect.tryPromise({
        try: async () => {
          const ref = await db
            .collection(path)
            .withConverter(converter)
            .add(data);
          return { id: ref.id, path: ref.path };
        },
        catch: (error) => mapError(error),
      }),
    set: (path, data, options) =>
      Effect.tryPromise({
        try: () =>
          db
            .doc(path)
            .withConverter(converter)
            .set(data, options || {}),
        catch: (error) => mapError(error),
      }),
    update: (path, data) =>
      Effect.tryPromise({
        try: () => db.doc(path).update(converter.toFirestore(data)),
        catch: (error) => mapError(error),
      }),
    remove: (path) =>
      Effect.tryPromise({
        try: () => db.doc(path).withConverter(converter).delete(),
        catch: (error) => mapError(error),
      }),
    query: (collectionPath, constraints) =>
      Effect.tryPromise({
        try: async () => {
          const query = buildQuery(db, collectionPath, constraints);
          const snapshot = await query.get();
          return Arr.filterMap(
            snapshot.docs,
            (doc): Option.Option<Snapshot> => packSnapshot(doc)
          );
        },
        catch: (error) => mapError(error),
      }),
    streamDoc: (path, options) =>
      Stream.asyncScoped<Option.Option<Snapshot>, FirestoreError>((emit) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const docRef = db.doc(path);
            return docRef.onSnapshot(
              (snapshot) => {
                emit.single(packSnapshot(snapshot, options));
              },
              (error) => {
                const mappedError = mapError(error);
                if (mappedError._tag === 'FirestoreError') {
                  emit.fail(mappedError);
                } else {
                  // Convert UnknownException to FirestoreError
                  emit.fail(FirestoreError.fromError(error as Error));
                }
              }
            );
          }),
          (unsubscribe) => Effect.sync(() => unsubscribe())
        )
      ),
    streamQuery: (collectionPath, constraints, options) =>
      Stream.asyncScoped<ReadonlyArray<Snapshot>, FirestoreError>((emit) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const query = buildQuery(db, collectionPath, constraints);
            return query.onSnapshot(
              (snapshot) => {
                const snapshots = Arr.filterMap(
                  snapshot.docs,
                  (doc): Option.Option<Snapshot> => packSnapshot(doc, options)
                );
                emit.single(snapshots);
              },
              (error) => {
                const mappedError = mapError(error);
                if (mappedError._tag === 'FirestoreError') {
                  emit.fail(mappedError);
                } else {
                  // Convert UnknownException to FirestoreError
                  emit.fail(FirestoreError.fromError(error as Error));
                }
              }
            );
          }),
          (unsubscribe) => Effect.sync(() => unsubscribe())
        )
      ),
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
