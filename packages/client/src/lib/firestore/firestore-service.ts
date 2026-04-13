import {
  Cause,
  Effect,
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
  getDoc,
  getDocs,
  addDoc,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { App, layer as appLayer } from '../app.js';
import { firestoreDecode, makeConverter } from './converter.js';
import { buildQuery } from './query-builder.js';

const dataOptions = (options?: FirestoreDataOptions) => ({
  serverTimestamps: options?.serverTimestamps ?? 'estimate',
});

const make = (db: Firestore) => {
  const converter = makeConverter(db);

  return FirestoreService.of({
    get: (path, options) =>
      Effect.tryPromise({
        try: () => getDoc(doc(db, path)),
        catch: (error) => FirestoreError.fromError(error),
      }).pipe(
        Effect.map((snapshot) => {
          const data = snapshot.data(dataOptions(options));
          if (!data) return Option.none();
          return Option.some([
            { id: snapshot.id, path: snapshot.ref.path },
            firestoreDecode(data),
          ]);
        })
      ),
    add: (path, data) =>
      Effect.tryPromise({
        try: () => addDoc(collection(db, path).withConverter(converter), data),
        catch: (error) => FirestoreError.fromError(error),
      }).pipe(Effect.map((ref) => ({ id: ref.id, path: ref.path }))),
    set: (path, data, options) =>
      Effect.tryPromise({
        try: () =>
          setDoc(doc(db, path).withConverter(converter), data, {
            merge: options?.merge,
          }),
        catch: (error) => FirestoreError.fromError(error),
      }),
    update: (path, data) =>
      Effect.tryPromise({
        try: () => updateDoc(doc(db, path), converter.toFirestore(data)),
        catch: (error) => FirestoreError.fromError(error),
      }),
    remove: (path) =>
      Effect.tryPromise({
        try: () => deleteDoc(doc(db, path).withConverter(converter)),
        catch: (error) => FirestoreError.fromError(error),
      }),
    query: (collectionPath, constraints) =>
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
      }),
    streamDoc: (path, options) =>
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
      ),
    streamQuery: (collectionPath, constraints, options) =>
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
      ),
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
