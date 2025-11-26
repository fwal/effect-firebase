import { Effect, Layer } from 'effect';
import {
  FirestoreError,
  FirestoreService,
  packSnapshot,
} from 'effect-firebase';
import {
  doc,
  getFirestore,
  getDoc,
  addDoc,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { converter } from './converter.js';

export const layer = () =>
  Layer.succeed(FirestoreService, {
    get: (path) =>
      Effect.tryPromise({
        try: () => getDoc(doc(getFirestore(), path).withConverter(converter)),
        catch: FirestoreError.fromError,
      }).pipe(Effect.map(packSnapshot)),
    add: (path, data) =>
      Effect.tryPromise({
        try: () =>
          addDoc(
            collection(getFirestore(), path).withConverter(converter),
            data
          ),
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
        try: () =>
          deleteDoc(doc(getFirestore(), path).withConverter(converter)),
        catch: FirestoreError.fromError,
      }),
  });
