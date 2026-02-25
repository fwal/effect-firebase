import { Effect, Layer, Array as Arr, Option, Stream } from 'effect';
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
import { fromFirestoreDocumentData, makeConverter } from './converter.js';
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
            fromFirestoreDocumentData(data),
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
          return Arr.filterMap(
            snapshot.docs,
            (queryDoc): Option.Option<Snapshot> => {
              const data = queryDoc.data();
              if (!data) return Option.none();
              return Option.some([
                { id: queryDoc.id, path: queryDoc.ref.path },
                fromFirestoreDocumentData(data),
              ]);
            }
          );
        },
        catch: (error) => FirestoreError.fromError(error),
      }),
    streamDoc: (path, options) =>
      Stream.asyncScoped<Option.Option<Snapshot>, FirestoreError>((emit) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const docRef = doc(db, path);
            return onSnapshot(
              docRef,
              (snapshot) => {
                const data = snapshot.data(dataOptions(options));
                if (!data) {
                  emit.single(Option.none());
                } else {
                  emit.single(
                    Option.some([
                      { id: snapshot.id, path: snapshot.ref.path },
                      fromFirestoreDocumentData(data),
                    ])
                  );
                }
              },
              (error) => {
                emit.fail(FirestoreError.fromError(error));
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
            const q = buildQuery(db, collectionPath, constraints);
            return onSnapshot(
              q,
              (snapshot) => {
                const snapshots = Arr.filterMap(
                  snapshot.docs,
                  (queryDoc): Option.Option<Snapshot> => {
                    const data = queryDoc.data(dataOptions(options));
                    if (!data) return Option.none();
                    return Option.some([
                      { id: queryDoc.id, path: queryDoc.ref.path },
                      fromFirestoreDocumentData(data),
                    ]);
                  }
                );
                emit.single(snapshots);
              },
              (error) => {
                emit.fail(FirestoreError.fromError(error));
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
