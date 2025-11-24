import { Effect, Layer } from 'effect';
import {
  FirestoreError,
  FirestoreService,
  packSnapshot,
} from 'effect-firebase';
import { UnknownException } from 'effect/Cause';
import { getFirestore } from 'firebase-admin/firestore';
import { FirebaseError } from 'firebase/app';
import { converter } from './converter.js';

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
  })
);
