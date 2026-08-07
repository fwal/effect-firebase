import { Effect, Layer, Stream } from 'effect';
import { Atom } from 'effect/unstable/reactivity';
import { FirestoreService } from 'effect-firebase';
import { PostId, PostModel, PostRepository } from '@example/shared';

/**
 * Indirection that makes the Firestore layer swappable at the registry level.
 *
 * Production: seeded by `<RegistryProvider initialValues={[[firestoreLayerAtom, layer]]}>`
 * Tests: seed with `MockFirestoreService(overrides)` from `@effect-firebase/mock`.
 *
 * `Atom.keepAlive` is required: the registry garbage-collects non-keepAlive
 * atoms that have no subscribers, so a seeded value would be dropped moments
 * after mount whenever the first route reads no atoms — later reads would
 * silently fall back to the default below.
 *
 * The default layer dies with an actionable message on first use, so a
 * forgotten seed fails with a pointer to the fix instead of being silenced
 * by a type cast.
 */
export const firestoreLayerAtom = Atom.keepAlive(
  Atom.make<Layer.Layer<FirestoreService>>(
    Layer.effect(
      FirestoreService,
      Effect.die(
        'firestoreLayerAtom must be seeded via <RegistryProvider initialValues={[[firestoreLayerAtom, layer]]}>',
      ),
    ),
  ),
);

/**
 * Bumped by the Firestore Mock devtools after every state toggle (mock mode
 * only). Views key their data subtree on this value, so a toggle remounts
 * the subtree: the old atoms are disposed and the fresh subscriptions start
 * from `Initial` against the new state. A plain refresh is not enough —
 * atom results keep their previous value while re-running, and a stream in
 * the `loading` state never emits, so the stale data would stay on screen.
 */
export const mockEpochAtom = Atom.keepAlive(Atom.make(0));

/**
 * Runtime atom — rebuilds whenever `firestoreLayerAtom` changes in the
 * registry (via `registry.set` / `useAtomSet`; `initialValues` is only read
 * when the registry is created). All Effect/Stream atoms in this app are
 * scoped to this runtime (and so receive `FirestoreService` automatically).
 */
export const clientRuntime = Atom.runtime((get) => get(firestoreLayerAtom));

// The atoms below double as the reference implementation for REACT.md §2–§4;
// postByIdAtom / postByIdLiveAtom are not used by the app itself.

// One-shot read by id. `withReactivity` re-runs the read whenever a mutation
// declaring the same key completes; the live atoms below don't need it
// because the Firestore snapshot stream already pushes updates.
export const postByIdAtom = Atom.family((id: typeof PostId.Type) =>
  clientRuntime
    .atom(Effect.flatMap(PostRepository, (r) => r.getById(id)))
    .pipe(Atom.withReactivity(['posts'])),
);

// Live read by id. The idle TTL lets a per-id listener linger briefly after
// its last subscriber unmounts (cheap back-navigation) without leaking one
// listener per visited post for the life of the app.
export const postByIdLiveAtom = Atom.family((id: typeof PostId.Type) =>
  clientRuntime
    .atom(Stream.unwrap(Effect.map(PostRepository, (r) => r.getByIdStream(id))))
    .pipe(Atom.setIdleTTL('30 seconds')),
);

// Live list of latest posts, keyed by the mock epoch. All subscribers pass
// the same epoch, so they share one Firestore subscription; a bumped epoch
// yields a *new* atom identity that re-subscribes from `Initial`. That is
// what makes the devtools' simulated `loading`/`error` states visible on an
// already-mounted page — an atom's retained value survives both refreshes
// and remounts, so only a fresh identity starts over. Outside mock mode the
// epoch is always `0` and this behaves like a single canonical atom.
export const latestPostsAtom = Atom.family((_epoch: number) =>
  clientRuntime.atom(
    Stream.unwrap(Effect.map(PostRepository, (r) => r.latestPosts())),
  ),
);

// Mutations — writable atoms exposing AsyncResult state and a setter.
// `concurrent: true` lets invocations overlap; the default interrupts the
// in-flight previous call (latest-wins), which can drop a write when two
// fire in quick succession. `reactivityKeys` refreshes the one-shot reads
// above after each completed mutation.
export const addPostAtom = clientRuntime.fn(
  Effect.fnUntraced(function* (data: typeof PostModel.insert.Type) {
    const r = yield* PostRepository;
    return yield* r.add(data);
  }),
  { concurrent: true, reactivityKeys: ['posts'] },
);

export const updatePostAtom = clientRuntime.fn(
  Effect.fnUntraced(function* (input: {
    readonly id: typeof PostId.Type;
    readonly data: Partial<Omit<typeof PostModel.update.Type, 'id'>>;
  }) {
    const r = yield* PostRepository;
    yield* r.update(input.id, input.data);
  }),
  { concurrent: true, reactivityKeys: ['posts'] },
);

export const deletePostAtom = clientRuntime.fn(
  Effect.fnUntraced(function* (id: typeof PostId.Type) {
    const r = yield* PostRepository;
    yield* r.delete(id);
  }),
  { concurrent: true, reactivityKeys: ['posts'] },
);
