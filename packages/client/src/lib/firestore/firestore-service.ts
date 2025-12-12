import { Effect, Layer, Array as Arr, Option, Stream } from 'effect';
import { FirestoreError, FirestoreService } from 'effect-firebase';
import type { FirestoreDataOptions, Snapshot } from 'effect-firebase';
import {
  doc,
  getFirestore,
  getDoc,
  getDocs,
  addDoc,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { converter, fromFirestoreDocumentData } from './converter.js';
import { buildQuery } from './query-builder.js';

const dataOptions = (options?: FirestoreDataOptions) => ({
  serverTimestamps: options?.serverTimestamps ?? 'estimate',
});

/**
 * Live Firestore Service using the client SDK.
 */
export const layer = Layer.succeed(FirestoreService, {
  get: (path, options) =>
    Effect.tryPromise({
      try: () => getDoc(doc(getFirestore(), path)),
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
      try: () =>
        addDoc(collection(getFirestore(), path).withConverter(converter), data),
      catch: (error) => FirestoreError.fromError(error),
    }).pipe(Effect.map((ref) => ({ id: ref.id, path: ref.path }))),
  set: (path, data, options) =>
    Effect.tryPromise({
      try: () =>
        setDoc(doc(getFirestore(), path).withConverter(converter), data, {
          merge: options?.merge,
        }),
      catch: (error) => FirestoreError.fromError(error),
    }),
  update: (path, data) =>
    Effect.tryPromise({
      try: () =>
        updateDoc(doc(getFirestore(), path), converter.toFirestore(data)),
      catch: (error) => FirestoreError.fromError(error),
    }),
  remove: (path) =>
    Effect.tryPromise({
      try: () => deleteDoc(doc(getFirestore(), path).withConverter(converter)),
      catch: (error) => FirestoreError.fromError(error),
    }),
  query: (collectionPath, constraints) =>
    Effect.tryPromise({
      try: async () => {
        const q = buildQuery(collectionPath, constraints);
        const snapshot = await getDocs(q);
        return Arr.filterMap(snapshot.docs, (doc): Option.Option<Snapshot> => {
          const data = doc.data();
          if (!data) return Option.none();
          return Option.some([
            { id: doc.id, path: doc.ref.path },
            fromFirestoreDocumentData(data),
          ]);
        });
      },
      catch: (error) => FirestoreError.fromError(error),
    }),
  streamDoc: (path, options) =>
    Stream.asyncScoped<Option.Option<Snapshot>, FirestoreError>((emit) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const docRef = doc(getFirestore(), path);
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
          const q = buildQuery(collectionPath, constraints);
          return onSnapshot(
            q,
            (snapshot) => {
              const snapshots = Arr.filterMap(
                snapshot.docs,
                (doc): Option.Option<Snapshot> => {
                  const data = doc.data(dataOptions(options));
                  if (!data) return Option.none();
                  return Option.some([
                    { id: doc.id, path: doc.ref.path },
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
