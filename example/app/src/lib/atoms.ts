import { Effect, Layer, Option, Stream } from 'effect';
import { Atom } from 'effect/unstable/reactivity';
import type { AtomContext } from 'effect/unstable/reactivity/Atom';
import type { FirestoreService } from 'effect-firebase';
import { Query } from 'effect-firebase';
import {
  PostId,
  PostModel,
  PostRepository,
} from '@example/shared';

/**
 * Indirection that makes the Firestore layer swappable at the registry level.
 *
 * Production: seeded by `<RegistryProvider initialValues={[[firestoreLayerAtom, layer]]}>`
 * Tests: seed with `MockFirestoreService(overrides)` from `@effect-firebase/mock`.
 *
 * Default value is an empty layer; any atom that depends on the runtime will
 * fail loudly if the provider doesn't seed it.
 */
export const firestoreLayerAtom = Atom.make<Layer.Layer<FirestoreService>>(
  Layer.empty as unknown as Layer.Layer<FirestoreService>,
);

/**
 * Runtime atom — rebuilds whenever `firestoreLayerAtom` changes in the
 * registry. All Effect/Stream atoms in this app are scoped to this runtime
 * (and so receive `FirestoreService` automatically).
 */
export const clientRuntime = Atom.runtime((get: AtomContext) =>
  get(firestoreLayerAtom),
);

const repoEffect = PostRepository;

// One-shot read by id
export const postByIdAtom = Atom.family((id: typeof PostId.Type) =>
  clientRuntime.atom(
    Effect.flatMap(repoEffect, (r) => r.getById(id)),
  ),
);

// Live read by id
export const postByIdLiveAtom = Atom.family((id: typeof PostId.Type) =>
  clientRuntime.atom(
    Stream.unwrap(Effect.map(repoEffect, (r) => r.getByIdStream(id))),
  ),
);

// Live list of latest posts. A single canonical atom (no family) so every
// subscriber shares one Firestore subscription.
export const latestPostsAtom = clientRuntime.atom(
  Stream.unwrap(Effect.map(repoEffect, (r) => r.latestPosts())),
);

// Mutations — writable atoms exposing AsyncResult state and a setter.
export const addPostAtom = clientRuntime.fn(
  Effect.fnUntraced(function* (data: typeof PostModel.insert.Type) {
    const r = yield* repoEffect;
    return yield* r.add(data);
  }),
);

export const updatePostAtom = clientRuntime.fn(
  Effect.fnUntraced(function* (input: {
    readonly id: typeof PostId.Type;
    readonly data: Partial<Omit<typeof PostModel.update.Type, 'id'>>;
  }) {
    const r = yield* repoEffect;
    yield* r.update(input.id, input.data);
  }),
);

export const deletePostAtom = clientRuntime.fn(
  Effect.fnUntraced(function* (id: typeof PostId.Type) {
    const r = yield* repoEffect;
    yield* r.delete(id);
  }),
);

// Re-export Option for consumers that need to discriminate getById results.
export { Option, Query };
