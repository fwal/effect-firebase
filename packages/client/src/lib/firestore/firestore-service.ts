import { Effect, Layer, Array as Arr, Option } from 'effect';
import {
  FirestoreError,
  FirestoreService,
  packSnapshot,
} from 'effect-firebase';
import type { Snapshot } from 'effect-firebase';
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
} from 'firebase/firestore';
import { converter, fromFirestoreDocumentData } from './converter.js';
import { buildQuery } from './query-builder.js';

export const layer = Layer.succeed(FirestoreService, {
  get: (path) =>
    Effect.tryPromise({
      try: () => getDoc(doc(getFirestore(), path).withConverter(converter)),
      catch: FirestoreError.fromError,
    }).pipe(Effect.map(packSnapshot)),
  add: (path, data) =>
    Effect.tryPromise({
      try: () =>
        addDoc(collection(getFirestore(), path).withConverter(converter), data),
      catch: FirestoreError.fromError,
    }).pipe(Effect.map((ref) => ({ id: ref.id, path: ref.path }))),
  set: (path, data, options) =>
    Effect.tryPromise({
      try: () =>
        setDoc(doc(getFirestore(), path).withConverter(converter), data, {
          merge: options?.merge,
        }),
      catch: FirestoreError.fromError,
    }),
  update: (path, data) =>
    Effect.tryPromise({
      try: () =>
        updateDoc(doc(getFirestore(), path), converter.toFirestore(data)),
      catch: FirestoreError.fromError,
    }),
  remove: (path) =>
    Effect.tryPromise({
      try: () => deleteDoc(doc(getFirestore(), path).withConverter(converter)),
      catch: FirestoreError.fromError,
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
      catch: FirestoreError.fromError,
    }),
});
