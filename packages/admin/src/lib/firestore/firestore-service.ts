import { Effect, Layer, Array as Arr, Option, Stream } from 'effect';
import {
  FirestoreError,
  FirestoreService,
  makeSnapshotPacker,
} from 'effect-firebase';
import type { Snapshot } from 'effect-firebase';
import { UnknownException } from 'effect/Cause';
import { getFirestore } from 'firebase-admin/firestore';
import { converter, fromFirestoreDocumentData } from './converter.js';
import { buildQuery } from './query-builder.js';

const packSnapshot = makeSnapshotPacker(fromFirestoreDocumentData);

const mapError = (error: unknown) =>
  error instanceof Error
    ? FirestoreError.fromError(error)
    : new UnknownException(error);

/**
 * Live Firestore service using the admin SDK.
 */
export const layer = Layer.succeed(
  FirestoreService,
  FirestoreService.of({
    get: (path, options) =>
      Effect.tryPromise({
        try: () => getFirestore().doc(path).get(),
        catch: (error) => mapError(error),
      }).pipe(Effect.map((snapshot) => packSnapshot(snapshot, options))),
    add: (path, data) =>
      Effect.tryPromise({
        try: async () => {
          const ref = await getFirestore()
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
          getFirestore()
            .doc(path)
            .withConverter(converter)
            .set(data, options || {}),
        catch: (error) => mapError(error),
      }),
    update: (path, data) =>
      Effect.tryPromise({
        try: () => getFirestore().doc(path).update(converter.toFirestore(data)),
        catch: (error) => mapError(error),
      }),
    remove: (path) =>
      Effect.tryPromise({
        try: () => getFirestore().doc(path).withConverter(converter).delete(),
        catch: (error) => mapError(error),
      }),
    query: (collectionPath, constraints) =>
      Effect.tryPromise({
        try: async () => {
          const query = buildQuery(collectionPath, constraints);
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
            const docRef = getFirestore().doc(path);
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
            const query = buildQuery(collectionPath, constraints);
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
  })
);
