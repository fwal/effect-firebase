import { Effect, Layer, Array as Arr, Option } from 'effect';
import {
  FirestoreError,
  FirestoreService,
  packSnapshot,
} from 'effect-firebase';
import type { Snapshot } from 'effect-firebase';
import { UnknownException } from 'effect/Cause';
import { getFirestore } from 'firebase-admin/firestore';
import { FirebaseError } from 'firebase/app';
import { converter, fromFirestoreDocumentData } from './converter.js';
import { buildQuery } from './query-builder.js';

const mapError = (error: unknown) =>
  error instanceof FirebaseError
    ? FirestoreError.fromError(error)
    : new UnknownException(error as Error);

export const layer = Layer.succeed(
  FirestoreService,
  FirestoreService.of({
    get: (path) =>
      Effect.tryPromise({
        try: () => getFirestore().doc(path).get(),
        catch: mapError,
      }).pipe(Effect.map(packSnapshot)),
    add: (path, data) =>
      Effect.tryPromise({
        try: async () => {
          const ref = await getFirestore()
            .collection(path)
            .withConverter(converter)
            .add(data);
          return { id: ref.id, path: ref.path };
        },
        catch: mapError,
      }),
    set: (path, data, options) =>
      Effect.tryPromise({
        try: () =>
          getFirestore()
            .doc(path)
            .withConverter(converter)
            .set(data, options || {}),
        catch: mapError,
      }),
    update: (path, data) =>
      Effect.tryPromise({
        try: () =>
          getFirestore().doc(path).withConverter(converter).update(data),
        catch: mapError,
      }),
    remove: (path) =>
      Effect.tryPromise({
        try: () => getFirestore().doc(path).withConverter(converter).delete(),
        catch: mapError,
      }),
    query: (collectionPath, constraints) =>
      Effect.tryPromise({
        try: async () => {
          const query = buildQuery(collectionPath, constraints);
          const snapshot = await query.get();
          return Arr.filterMap(
            snapshot.docs,
            (doc): Option.Option<Snapshot> => {
              const data = doc.data();
              if (!data) return Option.none();
              return Option.some([
                { id: doc.id, path: doc.ref.path },
                fromFirestoreDocumentData(data),
              ]);
            }
          );
        },
        catch: mapError,
      }),
  })
);
