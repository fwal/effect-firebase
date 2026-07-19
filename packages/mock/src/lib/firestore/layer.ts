import {
  Clock,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Random,
  Ref,
  Schema,
  Stream,
  SubscriptionRef,
} from 'effect';
import {
  FirestoreError,
  FirestoreSchema,
  FirestoreService,
  Snapshot,
  type FirestoreServiceShape,
} from 'effect-firebase';
import { MockController, type MockControllerShape } from './controller.js';
import { applyConstraints } from './query-filter.js';
import type { Fixture } from './fixture.js';
import * as MockState from './state.js';
import {
  docsInCollection,
  makeSnapshot,
  parentPath,
  validateCollectionPath,
  validateDocPath,
  type StoreSnapshot,
} from './store.js';
import {
  applyMerge,
  applySet,
  applyUpdate,
  equals,
  type DocData,
} from './value.js';

export interface LayerOptions {
  /**
   * Fixtures to seed the backend with.
   */
  readonly fixtures?: ReadonlyArray<Fixture>;
  /**
   * Initial simulated states, keyed by collection path
   * (or {@link MockState.All} for every collection).
   */
  readonly states?: Readonly<Record<string, MockState.StateInput>>;
  /**
   * Simulated latency applied to every operation and to the first emission
   * of every stream. Defaults to none.
   */
  readonly latency?: Duration.Input;
}

const ID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const generateId: Effect.Effect<string> = Effect.gen(function* () {
  let id = '';
  for (let i = 0; i < 20; i++) {
    const index = yield* Random.nextIntBetween(0, ID_ALPHABET.length);
    id += ID_ALPHABET[index];
  }
  return id;
});

const invalidArgument = (message: string): FirestoreError =>
  new FirestoreError({
    code: 'invalid-argument',
    name: 'FirebaseError',
    message,
  });

const notFound = (path: string): FirestoreError =>
  new FirestoreError({
    code: 'not-found',
    name: 'FirebaseError',
    message: `No document to update: ${path}`,
  });

const now: Effect.Effect<FirestoreSchema.Timestamp> = Effect.map(
  Clock.currentTimeMillis,
  (millis) => FirestoreSchema.Timestamp.fromMillis(millis)
);

const optionSnapshotEquals = (
  a: Option.Option<Snapshot>,
  b: Option.Option<Snapshot>
): boolean =>
  Option.isNone(a) || Option.isNone(b)
    ? Option.isNone(a) === Option.isNone(b)
    : snapshotEquals(a.value, b.value);

const snapshotEquals = (a: Snapshot, b: Snapshot): boolean =>
  a[0].path === b[0].path && equals(a[1], b[1]);

const snapshotsEqual = (
  a: ReadonlyArray<Snapshot>,
  b: ReadonlyArray<Snapshot>
): boolean =>
  a.length === b.length &&
  a.every((snapshot, index) => snapshotEquals(snapshot, b[index]));

const makeFirestore = (
  ref: SubscriptionRef.SubscriptionRef<StoreSnapshot>,
  latency: Ref.Ref<Duration.Duration>
): FirestoreServiceShape => {
  const sleep = Effect.flatMap(Ref.get(latency), (duration) =>
    Duration.toMillis(duration) > 0 ? Effect.sleep(duration) : Effect.void
  );

  const stateFor = (collectionPath: string) =>
    Effect.map(SubscriptionRef.get(ref), (snapshot) =>
      MockState.resolve(snapshot.states, collectionPath)
    );

  /**
   * Gate an operation on the collection's simulated state: hang while
   * loading, fail while erroring, and continue otherwise.
   */
  const guard = (collectionPath: string) =>
    Effect.flatMap(stateFor(collectionPath), (state) => {
      switch (state._tag) {
        case 'Loading':
          return Effect.never;
        case 'Error':
          return Effect.fail(state.error);
        default:
          return Effect.succeed(state);
      }
    });

  const validate = (message: string | undefined) =>
    message === undefined ? Effect.void : Effect.fail(invalidArgument(message));

  const readDoc = (
    path: string
  ): Effect.Effect<Option.Option<Snapshot>, FirestoreError> =>
    Effect.gen(function* () {
      yield* validate(validateDocPath(path));
      yield* sleep;
      const state = yield* guard(parentPath(path));
      if (state._tag === 'Empty') {
        return Option.none();
      }
      const snapshot = yield* SubscriptionRef.get(ref);
      const data = snapshot.docs[path];
      return data === undefined
        ? Option.none()
        : Option.some(makeSnapshot(path, data));
    });

  const write = (
    collectionPath: string,
    mutate: (
      docs: Readonly<Record<string, DocData>>,
      timestamp: FirestoreSchema.Timestamp
    ) => Effect.Effect<Readonly<Record<string, DocData>>, FirestoreError>
  ): Effect.Effect<void, FirestoreError> =>
    Effect.gen(function* () {
      yield* sleep;
      yield* guard(collectionPath);
      const timestamp = yield* now;
      // Read-modify-write inside updateEffect keeps concurrent writes consistent.
      yield* SubscriptionRef.updateEffect(ref, (snapshot) =>
        Effect.map(mutate(snapshot.docs, timestamp), (docs) => ({
          ...snapshot,
          docs,
        }))
      );
    });

  return {
    get: (path) => readDoc(path),

    add: (path, data) =>
      Effect.gen(function* () {
        yield* validate(validateCollectionPath(path));
        let id = yield* generateId;
        const snapshot = yield* SubscriptionRef.get(ref);
        while (snapshot.docs[`${path}/${id}`] !== undefined) {
          id = yield* generateId;
        }
        const docPath = `${path}/${id}`;
        yield* write(path, (docs, timestamp) =>
          Effect.succeed({ ...docs, [docPath]: applySet(data, timestamp) })
        );
        return { id, path: docPath };
      }),

    set: (path, data, options) =>
      Effect.gen(function* () {
        yield* validate(validateDocPath(path));
        yield* write(parentPath(path), (docs, timestamp) =>
          Effect.succeed({
            ...docs,
            [path]: options?.merge
              ? applyMerge(docs[path], data, timestamp)
              : applySet(data, timestamp),
          })
        );
      }),

    update: (path, data) =>
      Effect.gen(function* () {
        yield* validate(validateDocPath(path));
        yield* write(parentPath(path), (docs, timestamp) => {
          const existing = docs[path];
          if (existing === undefined) {
            return Effect.fail(notFound(path));
          }
          return Effect.succeed({
            ...docs,
            [path]: applyUpdate(existing, data, timestamp),
          });
        });
      }),

    delete: (path) =>
      Effect.gen(function* () {
        yield* validate(validateDocPath(path));
        yield* write(parentPath(path), (docs) => {
          const rest = { ...docs };
          delete rest[path];
          return Effect.succeed(rest);
        });
      }),

    deleteRecursive: (path) =>
      Effect.gen(function* () {
        yield* validate(validateDocPath(path));
        const prefix = `${path}/`;
        yield* write(parentPath(path), (docs) =>
          Effect.succeed(
            Object.fromEntries(
              Object.entries(docs).filter(
                ([docPath]) =>
                  docPath !== path && !docPath.startsWith(prefix)
              )
            )
          )
        );
      }),

    query: (collectionPath, constraints) =>
      Effect.gen(function* () {
        yield* validate(validateCollectionPath(collectionPath));
        yield* sleep;
        const state = yield* guard(collectionPath);
        if (state._tag === 'Empty') {
          return [];
        }
        const snapshot = yield* SubscriptionRef.get(ref);
        return applyConstraints(
          docsInCollection(snapshot.docs, collectionPath),
          constraints
        );
      }),

    streamDoc: (path) => {
      const invalid = validateDocPath(path);
      if (invalid !== undefined) {
        return Stream.fail(invalidArgument(invalid));
      }
      const collectionPath = parentPath(path);
      return Stream.unwrap(
        Effect.as(
          sleep,
          SubscriptionRef.changes(ref).pipe(
            Stream.switchMap(
              (
                snapshot
              ): Stream.Stream<Option.Option<Snapshot>, FirestoreError> => {
                const state = MockState.resolve(snapshot.states, collectionPath);
                switch (state._tag) {
                  case 'Loading':
                    return Stream.never;
                  case 'Error':
                    return Stream.fail(state.error);
                  case 'Empty':
                    return Stream.succeed(Option.none());
                  case 'Data': {
                    const data = snapshot.docs[path];
                    return Stream.succeed(
                      data === undefined
                        ? Option.none()
                        : Option.some(makeSnapshot(path, data))
                    );
                  }
                }
              }
            ),
            Stream.changesWith(optionSnapshotEquals)
          )
        )
      );
    },

    streamQuery: (collectionPath, constraints) => {
      const invalid = validateCollectionPath(collectionPath);
      if (invalid !== undefined) {
        return Stream.fail(invalidArgument(invalid));
      }
      return Stream.unwrap(
        Effect.as(
          sleep,
          SubscriptionRef.changes(ref).pipe(
            Stream.switchMap(
              (
                snapshot
              ): Stream.Stream<ReadonlyArray<Snapshot>, FirestoreError> => {
                const state = MockState.resolve(snapshot.states, collectionPath);
                switch (state._tag) {
                  case 'Loading':
                    return Stream.never;
                  case 'Error':
                    return Stream.fail(state.error);
                  case 'Empty':
                    return Stream.succeed([]);
                  case 'Data':
                    return Stream.succeed(
                      applyConstraints(
                        docsInCollection(snapshot.docs, collectionPath),
                        constraints
                      )
                    );
                }
              }
            ),
            Stream.changesWith(snapshotsEqual)
          )
        )
      );
    },
  };
};

const makeController = (
  ref: SubscriptionRef.SubscriptionRef<StoreSnapshot>,
  latency: Ref.Ref<Duration.Duration>,
  initial: { snapshot: StoreSnapshot; latency: Duration.Duration }
): MockControllerShape => ({
  setState: (collectionPath, state) =>
    SubscriptionRef.update(ref, (snapshot) => ({
      ...snapshot,
      states: {
        ...snapshot.states,
        [collectionPath]: MockState.fromInput(state),
      },
    })),

  clearState: (collectionPath) =>
    SubscriptionRef.update(ref, (snapshot) => {
      const states = { ...snapshot.states };
      delete states[collectionPath];
      return { ...snapshot, states };
    }),

  states: Effect.map(SubscriptionRef.get(ref), (snapshot) => snapshot.states),

  docs: Effect.map(SubscriptionRef.get(ref), (snapshot) => snapshot.docs),

  changes: SubscriptionRef.changes(ref),

  seed: (fixture) =>
    Effect.flatMap(fixture.build, (docs) =>
      SubscriptionRef.update(ref, (snapshot) => ({
        ...snapshot,
        docs: { ...snapshot.docs, ...docs },
      }))
    ),

  setDoc: (path, data) =>
    SubscriptionRef.update(ref, (snapshot) => ({
      ...snapshot,
      docs: { ...snapshot.docs, [path]: data },
    })),

  removeDoc: (path) =>
    SubscriptionRef.update(ref, (snapshot) => {
      const docs = { ...snapshot.docs };
      delete docs[path];
      return { ...snapshot, docs };
    }),

  setLatency: (input) => Ref.set(latency, Duration.fromInputUnsafe(input)),

  reset: Effect.flatMap(Ref.set(latency, initial.latency), () =>
    SubscriptionRef.set(ref, initial.snapshot)
  ),
});

/**
 * An in-memory, reactive `FirestoreService` backend.
 *
 * The returned layer provides both the `FirestoreService` implementation and
 * a {@link MockController} for driving it at runtime. Every `Effect.provide`
 * gets a fresh, isolated store.
 *
 * @example
 * ```ts
 * const mock = layer({
 *   fixtures: [posts],
 *   states: { comments: 'loading' },
 *   latency: '200 millis',
 * });
 * ```
 */
export const layer = (
  options: LayerOptions = {}
): Layer.Layer<FirestoreService | MockController, Schema.SchemaError> =>
  Layer.effectContext(
    Effect.gen(function* () {
      let docs: Record<string, DocData> = {};
      for (const fixture of options.fixtures ?? []) {
        docs = { ...docs, ...(yield* fixture.build) };
      }
      const states = Object.fromEntries(
        Object.entries(options.states ?? {}).map(([key, input]) => [
          key,
          MockState.fromInput(input),
        ])
      );
      const initialLatency = Duration.fromInputUnsafe(options.latency ?? 0);
      const snapshot: StoreSnapshot = { docs, states };
      const ref = yield* SubscriptionRef.make(snapshot);
      const latency = yield* Ref.make(initialLatency);
      return Context.make(FirestoreService, makeFirestore(ref, latency)).pipe(
        Context.add(
          MockController,
          makeController(ref, latency, { snapshot, latency: initialLatency })
        )
      );
    })
  );
