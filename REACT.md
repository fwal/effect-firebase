# React patterns for `effect-firebase`

This guide shows how to use `effect-firebase` repositories from a React app:
fetching, subscribing to live updates, mutations, validated forms, and tests.
It documents reference code in [`example/app`](./example/app) — copy what fits,
adapt the rest.

The patterns are built on
[`@effect/atom-react`](https://www.npmjs.com/package/@effect/atom-react)
(official Effect-TS React binding) and `effect`'s built-in
`unstable/reactivity/Atom` module. Both are part of Effect v4 and ship in
lockstep — the `react` binding peer-depends on the exact Effect beta it was
released against.

## Contents

1. [Runtime setup](#1-runtime-setup)
2. [Repository atoms](#2-repository-atoms)
3. [Reading data](#3-reading-data)
4. [Mutations](#4-mutations)
5. [Forms with validation](#5-forms-with-validation)
6. [Testing with a mock layer](#6-testing-with-a-mock-layer)
7. [Developing against the mock backend](#7-developing-against-the-mock-backend)
8. [Caveats](#8-caveats)

---

## 1. Runtime setup

The runtime is composed from two atoms:

- A **layer atom** that holds the `Layer<FirestoreService>`. This is the test
  seam — production code seeds it via `RegistryProvider.initialValues`; tests
  override it with a mock layer.
- A **runtime atom** built from the layer atom via `Atom.runtime((get) => get(layerAtom))`.
  All repository atoms are created via `runtime.atom(...)` / `runtime.fn(...)`
  so they receive `FirestoreService` from the configured layer.

```ts
// example/app/src/lib/atoms.ts
import { Atom } from 'effect/unstable/reactivity';
import { Effect, Layer } from 'effect';
import { FirestoreService } from 'effect-firebase';

// Atom.keepAlive is required: the registry garbage-collects non-keepAlive
// atoms with no subscribers, so the seeded layer would be dropped moments
// after mount whenever the first route reads no atoms.
export const firestoreLayerAtom = Atom.keepAlive(
  Atom.make<Layer.Layer<FirestoreService>>(
    // The default dies with an actionable message on first use, so a
    // forgotten seed fails loudly instead of being silenced by a cast.
    Layer.effect(
      FirestoreService,
      Effect.die('firestoreLayerAtom must be seeded via RegistryProvider initialValues'),
    ),
  ),
);

export const clientRuntime = Atom.runtime((get) => get(firestoreLayerAtom));
```

At app root, wrap the tree in `RegistryProvider` and seed the layer atom:

```tsx
// example/app/src/app/app.tsx
import { RegistryProvider } from '@effect/atom-react';
import { Client } from '@effect-firebase/client';
import { firestoreLayerAtom } from '../lib/atoms.js';

export function App({ children }) {
  const layer = useMemo(() => {
    const firestore = initializeFirestore(initializeApp({...}), {...});
    connectFirestoreEmulator(firestore, 'localhost', 8080);
    return Client.layer({ firestore });
  }, []);

  const initialValues = useMemo(
    () => [[firestoreLayerAtom, layer] as const] as const,
    [layer],
  );

  return (
    <RegistryProvider initialValues={initialValues}>
      {children}
    </RegistryProvider>
  );
}
```

Wrap the layer in `useMemo` so Firebase initialization doesn't re-run on
every render. Note that `RegistryProvider` reads `initialValues` only when
the registry is first created — changing the array (or the layer's identity)
on a later render is silently ignored. To swap the layer at runtime, set the
atom's value in the registry instead — `registry.set(firestoreLayerAtom, newLayer)`
or the setter from `useAtomSet(firestoreLayerAtom)`. The runtime atom rebuilds
(tearing down every subscription) whenever the layer atom's **value** changes
in the registry.

## 2. Repository atoms

For each repository, define atoms once at module scope. Atom identity is
stable across renders and subscribers, so the same `latestPostsAtom` shared
across components opens a single Firestore subscription.

```ts
// example/app/src/lib/atoms.ts
import { Effect, Stream } from 'effect';
import { Atom } from 'effect/unstable/reactivity';
import { PostId, PostRepository, PostModel } from '@example/shared';

// One-shot by id — keyed atom, one Effect per id. `withReactivity` re-runs
// the read whenever a mutation declaring the same reactivity key completes.
export const postByIdAtom = Atom.family((id: typeof PostId.Type) =>
  clientRuntime
    .atom(Effect.flatMap(PostRepository, (r) => r.getById(id)))
    .pipe(Atom.withReactivity(['posts'])),
);

// Live by id — keyed atom, one Stream per id. The idle TTL keeps a per-id
// listener alive briefly after its last subscriber unmounts (cheap
// back-navigation) without leaking one listener per visited post.
export const postByIdLiveAtom = Atom.family((id: typeof PostId.Type) =>
  clientRuntime
    .atom(
      Stream.unwrap(Effect.map(PostRepository, (r) => r.getByIdStream(id))),
    )
    .pipe(Atom.setIdleTTL('30 seconds')),
);

// Live list — single shared atom (no family)
export const latestPostsAtom = clientRuntime.atom(
  Stream.unwrap(Effect.map(PostRepository, (r) => r.latestPosts())),
);

// Mutations — writable atoms with AsyncResult state and a setter
export const addPostAtom = clientRuntime.fn(
  Effect.fnUntraced(function* (data: typeof PostModel.insert.Type) {
    const r = yield* PostRepository;
    return yield* r.add(data);
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
```

Notes:

- `Atom.family((arg) => atom)` returns a function that memoizes atoms by `arg`
  (using `Equal`-based equality). `postByIdLiveAtom(postId)` returns the same
  atom instance each time, so multiple components subscribed to the same id
  share one Stream.
- `clientRuntime.atom(effect)` and `clientRuntime.atom(stream)` are
  overloaded; both produce an `Atom<AsyncResult<A, E>>`.
- `clientRuntime.fn(effectFn)` produces a writable atom whose value is the
  `AsyncResult` of the last invocation, and whose setter runs the function.
- **Invalidation:** live (stream) atoms need none — the Firestore snapshot
  pushes updates. One-shot reads pair `Atom.withReactivity(keys)` on the read
  side with `reactivityKeys` on mutations: a completed mutation re-runs every
  read that shares a key.
- **Concurrency:** without `concurrent: true`, a second invocation of an fn
  atom *interrupts* the in-flight previous one (latest-wins) and all pending
  promise-mode awaiters resolve with the last invocation's result. That
  default suits search-as-you-type reads; for mutations it can silently drop
  a write, so pass `concurrent: true`.

## 3. Reading data

```tsx
import { AsyncResult } from 'effect/unstable/reactivity';
import { useAtomValue } from '@effect/atom-react';
import { Cause } from 'effect';
import { latestPostsAtom } from '../lib/atoms.js';

function PostList() {
  const result = useAtomValue(latestPostsAtom);

  return AsyncResult.builder(result)
    .onInitial(() => <Spinner />)
    .onFailure((cause) => <Error message={Cause.pretty(cause)} />)
    .onSuccess((posts) =>
      posts.length === 0
        ? <Empty />
        : <>{posts.map((p) => <PostCard key={p.id} post={p} />)}</>,
    )
    .exhaustive();
}
```

`AsyncResult<A, E>` is `Initial | Success(value) | Failure(cause: Cause<E>)`.
The `AsyncResult.builder` helper tracks handled cases at the type level:
`.exhaustive()` only becomes available once every case is handled, while
`.render()` is lenient — it compiles with handlers missing, renders `null`
for an unhandled initial/success and **rethrows** an unhandled failure at
runtime. Prefer `.exhaustive()`. Alternatives like `AsyncResult.match` and a
plain `_tag` switch are also available.

For keyed reads, call the family:

```tsx
function PostView({ id }: { id: typeof PostId.Type }) {
  const result = useAtomValue(postByIdLiveAtom(id));
  // ...
}
```

## 4. Mutations

```tsx
import { useAtomSet } from '@effect/atom-react';
import { addPostAtom, deletePostAtom } from '../lib/atoms.js';

function CreatePost() {
  const create = useAtomSet(addPostAtom, { mode: 'promise' });
  return (
    <Button
      onClick={() => create({ title: 'Hello', /* ... */ }).catch(/* ... */)}
    >
      Create
    </Button>
  );
}
```

`useAtomSet(atom, { mode: 'promise' })` returns `(arg) => Promise<A>`. Modes:

- `'value'` (default) — fire-and-forget; returns `void`.
- `'promise'` — await the result; rejects on failure.
- `'promiseExit'` — await an `Exit<A, E>` instead of throwing.

If you also need the `AsyncResult` state (loading / success / error) for UI,
use `useAtom(atom)` to get both `[result, set]`.

## 5. Forms with validation

`effect/Schema` implements
[Standard Schema v1](https://github.com/standard-schema/standard-schema), and
[`@tanstack/react-form`](https://tanstack.com/form/latest) accepts a Standard
Schema validator directly. Wrap your schema with `Schema.toStandardSchemaV1`
and pass it to `validators.onChange`:

```tsx
import { useState } from 'react';
import { Schema } from 'effect';
import { useForm } from '@tanstack/react-form';
import { useAtomSet } from '@effect/atom-react';

const PostFormSchema = Schema.Struct({
  title: Schema.NonEmptyString,
  content: Schema.NonEmptyString,
});

const postFormValidator = Schema.toStandardSchemaV1(PostFormSchema);

function PostForm() {
  const create = useAtomSet(addPostAtom, { mode: 'promise' });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { title: '', content: '' },
    validators: { onChange: postFormValidator },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        await create({ ...value, /* fill required fields */ });
        form.reset();
      } catch {
        // form-core rethrows onSubmit errors out of handleSubmit, so an
        // unhandled failure here becomes an unhandled promise rejection
        // with no user-visible feedback.
        setSubmitError('Failed to save post');
      }
    },
  });
  // render <form.Field> children with field.state.meta.errors[0]?.message,
  // render submitError, and submit with `void form.handleSubmit()`
}
```

See [`example/app/src/routes/firestore.tsx`](./example/app/src/routes/firestore.tsx)
for the full form including edit mode (re-key the form on the editing id to
load fresh defaults).

## 6. Testing with a mock layer

`@effect-firebase/mock` exports `MockFirestoreService(overrides)`, which
returns a `Layer<FirestoreService>` whose methods throw by default but accept
per-method overrides. Pass it as the value for `firestoreLayerAtom` in
`RegistryProvider.initialValues`:

```tsx
// example/app/src/__tests__/firestore.test.tsx
import { render, screen } from '@testing-library/react';
import { Stream } from 'effect';
import { MockFirestoreService } from '@effect-firebase/mock';
import { RegistryProvider } from '@effect/atom-react';
import { firestoreLayerAtom } from '../lib/atoms.js';
import { PostList } from '../routes/firestore.js';

it('renders the empty state when no posts exist', async () => {
  const layer = MockFirestoreService({
    streamQuery: () => Stream.make([]),
  });
  render(
    <RegistryProvider initialValues={[[firestoreLayerAtom, layer] as const]}>
      <PostList onEdit={() => undefined} />
    </RegistryProvider>,
  );
  expect(await screen.findByText(/No posts found/i)).toBeTruthy();
});
```

The components under test never change between production and test — only the
layer at the registry boundary differs. Vitest needs `environment: 'jsdom'`;
see the `test` block in [`example/app/vite.config.ts`](./example/app/vite.config.ts).

## 7. Developing against the mock backend

For building pages, `@effect-firebase/mock` goes further than per-method
overrides: `make()` returns a full in-memory backend seeded from
schema-encoded fixtures, with a controller for toggling every collection
between **data / empty / loading / error** at runtime. Because the layer atom
is the only seam, the swap is one `initialValues` entry:

```tsx
// lib/mock.ts — shared by the app runtime and the devtools panel
export const mockBackend = make({
  fixtures: [
    fixture(PostModel, { collectionPath: 'posts', idField: 'id', docs: [...] }),
  ],
});

// app.tsx — seed the registry with the mock instead of Client.layer
<RegistryProvider
  initialValues={[[firestoreLayerAtom, Layer.orDie(mockBackend.layer)] as const]}
>
```

`@effect-firebase/devtools` ships the controller as a TanStack Devtools
plugin, so the states can be flipped from a panel while the page is running:

```tsx
import { TanStackDevtools } from '@tanstack/react-devtools';
import { firestoreMockPlugin } from '@effect-firebase/devtools';

<TanStackDevtools
  plugins={[
    firestoreMockPlugin(mockBackend.controller, {
      // Stream errors are terminal (onSnapshot semantics): refresh the
      // affected atoms after a toggle so they re-subscribe.
      onStateChange: () => refreshPosts(),
    }),
  ]}
/>;
```

The example app wires this up behind an env flag — run `pnpm example:mock`
and open the devtools panel on the Firestore page. See
[`example/app/src/lib/mock.ts`](./example/app/src/lib/mock.ts) and
[`example/app/src/app/app.tsx`](./example/app/src/app/app.tsx).

## 8. Caveats

- **`@effect/atom-react` is lockstep with `effect` betas.** Each release of
  `@effect/atom-react@4.0.0-beta.N` peer-depends on `effect@^4.0.0-beta.N`. Bump
  them together.
- **The layer atom's value drives the runtime.** The runtime is rebuilt —
  tearing down every subscription — whenever the layer atom's value changes
  in the registry (`registry.set` / `useAtomSet`). `initialValues` is read
  only at registry creation, so it can't be used to swap the layer later.
- **Atom families key by `Equal` equality.** Branded ids work out of the box;
  object keys need to be either `Equal`-implementing classes or pre-serialized
  to a stable string before passing to a family.
- **Subscriptions are refcounted, and disposal is immediate by default.**
  When the last subscriber of an atom unmounts, the registry disposes the
  atom — and its stream — right away. To keep an atom warm across remounts,
  opt in per atom with `Atom.setIdleTTL('30 seconds')` or `Atom.keepAlive`,
  or set a registry-wide `defaultIdleTTL` on `RegistryProvider`. During a TTL
  window the subscription stays live (not paused), and a remount reattaches
  to it; after the TTL nothing is cached.
- **`unstable/reactivity` is unstable.** The Atom module lives in Effect's
  `unstable/` namespace until v4 stable. Treat API churn between betas as
  possible — pin tightly and update intentionally.
