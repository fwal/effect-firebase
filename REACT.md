# React patterns for `effect-firebase`

This guide shows how to use `effect-firebase` repositories from a React app:
fetching, subscribing to live updates, mutations, validated forms, and tests.
It documents reference code in [`example/app`](./example/app) — copy what fits,
adapt the rest.

The patterns are built on
[`@effect/atom-react`](https://github.com/Effect-TS/effect-smol/tree/main/packages/atom/react)
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
7. [Why atoms over TanStack Query?](#7-why-atoms-over-tanstack-query)
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
import { Layer } from 'effect';
import type { FirestoreService } from 'effect-firebase';

export const firestoreLayerAtom = Atom.make<Layer.Layer<FirestoreService>>(
  Layer.empty as unknown as Layer.Layer<FirestoreService>,
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

Wrap the layer in `useMemo` — the registry rebuilds the runtime whenever the
layer identity changes, so a fresh layer per render would tear down every
stream subscription on every render.

## 2. Repository atoms

For each repository, define atoms once at module scope. Atom identity is
stable across renders and subscribers, so the same `latestPostsAtom` shared
across components opens a single Firestore subscription.

```ts
// example/app/src/lib/atoms.ts
import { Effect, Stream } from 'effect';
import { Atom } from 'effect/unstable/reactivity';
import { PostId, PostRepository, PostModel } from '@example/shared';

// One-shot by id — keyed atom, one Effect per id
export const postByIdAtom = Atom.family((id: typeof PostId.Type) =>
  clientRuntime.atom(Effect.flatMap(PostRepository, (r) => r.getById(id))),
);

// Live by id — keyed atom, one Stream per id
export const postByIdLiveAtom = Atom.family((id: typeof PostId.Type) =>
  clientRuntime.atom(
    Stream.unwrap(Effect.map(PostRepository, (r) => r.getByIdStream(id))),
  ),
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
);

export const deletePostAtom = clientRuntime.fn(
  Effect.fnUntraced(function* (id: typeof PostId.Type) {
    const r = yield* PostRepository;
    yield* r.delete(id);
  }),
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
    .render();
}
```

`AsyncResult<A, E>` is `Initial | Success(value) | Failure(cause: Cause<E>)`.
The `AsyncResult.builder` helper enforces exhaustive case handling at the type
level; alternatives like `AsyncResult.match` and a plain `_tag` switch are
also available.

For keyed reads, call the family:

```tsx
function PostView({ id }: { id: PostId }) {
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
import { Schema } from 'effect';
import { useForm } from '@tanstack/react-form';
import { useAtomSet } from '@effect/atom-react';

const PostFormSchema = Schema.Struct({
  title: Schema.NonEmptyString,
  content: Schema.NonEmptyString,
});

function PostForm() {
  const create = useAtomSet(addPostAtom, { mode: 'promise' });
  const form = useForm({
    defaultValues: { title: '', content: '' },
    validators: { onChange: Schema.toStandardSchemaV1(PostFormSchema) },
    onSubmit: async ({ value }) => {
      await create({ ...value, /* fill required fields */ });
      form.reset();
    },
  });
  // render <form.Field> children with field.state.meta.errors[0]?.message
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

## 7. Why atoms over TanStack Query?

[TanStack Query](https://tanstack.com/query/latest) is the dominant React data-
fetching library and is what most teams reach for first. It's a reasonable
choice for an Effect app — but for a Firestore app whose data layer is
already entirely in Effect, atoms fit better. Here's the honest comparison.

### What each looks like for the live-posts pattern

```ts
// With @effect/atom-react
export const latestPostsAtom = clientRuntime.atom(
  Stream.unwrap(Effect.map(PostRepository, (r) => r.latestPosts())),
);

function PostList() {
  const result = useAtomValue(latestPostsAtom);
  return AsyncResult.builder(result)
    .onInitial(/* ... */)
    .onFailure(/* ... */)
    .onSuccess(/* ... */)
    .render();
}
```

```ts
// With TanStack Query
function usePostsLive() {
  const qc = useQueryClient();
  const runtime = useRuntime();
  const query = useQuery({
    queryKey: ['posts', 'live'],
    queryFn: () => new Promise<Post[]>(() => {}), // never resolves; setQueryData feeds it
    staleTime: Infinity,
  });
  useEffect(() => {
    const fiber = runtime.runFork(
      Stream.runForEach(latestPostsStream(), (posts) =>
        Effect.sync(() => qc.setQueryData(['posts', 'live'], posts)),
      ),
    );
    return () => { runtime.runFork(Fiber.interrupt(fiber)); };
  }, [qc, runtime]);
  return query;
}

function PostList() {
  const { data, isPending, error } = usePostsLive();
  if (isPending) return <Spinner />;
  if (error) return <Error message={String(error)} />;
  // ...
}
```

The Query version is fighting the abstraction: `queryFn` resolves once, but a
Stream emits forever, so the standard pattern is a never-resolving promise
plus a side `useEffect` that pushes emissions into the cache via
`setQueryData`. Query has no concept of the underlying stream, so cleanup,
refcounting, and dedup across components is all your responsibility.

### Where TanStack Query wins

- **Ecosystem and familiarity.** Most React engineers already know it.
  Onboarding is faster, references are everywhere, AI tools know it cold.
- **DevTools.** `@tanstack/react-query-devtools` shows the cache, query
  state, and mutation history. There's no equivalent for atoms today.
- **Cross-source caching.** If your app fetches from Firestore *and* REST
  APIs *and* a non-Effect SDK, Query unifies them under one cache. Atoms
  only help with Effect-based sources.
- **Battle-tested cache controls.** Stale-while-revalidate, refetch on
  focus / reconnect / interval, retry-with-backoff, prefetching,
  pagination/infinite-query helpers, query cancellation via `AbortSignal`,
  SSR hydration with Next.js or TanStack Start.
- **Familiar mutation patterns.** `useMutation` + `onSuccess: invalidate(...)`
  is a well-known idiom. Optimistic updates are a documented pattern.

### Where atoms win

- **Streams are first-class.** `runtime.atom(stream)` and `runtime.atom(effect)`
  have the same shape. Refcounted subscription, idle TTL, automatic cleanup
  on last-unsubscriber — all in the library, not in your `useEffect`.
- **No Effect ↔ Promise boundary.** Atoms keep the typed `E` channel and the
  full `Cause` end-to-end. Query erases both into `unknown` / a thrown JS
  value at the `queryFn` boundary.
- **Layer composition is the runtime model.** `clientRuntime = Atom.runtime((get) => get(layerAtom))`
  is the test seam, the dependency-injection mechanism, and the multi-tenancy
  story all at once. Query has no equivalent — you `Effect.provide(layer)` at
  every call site, or hoist a runtime to context and remember to thread it.
- **One state machine.** `AsyncResult<A, E>` mirrors `Exit` and carries the
  same semantics. With Query you reason about `isPending` / `isFetching` /
  `isError` / `isStale` *and* the Effect's own success/failure separately.
- **Family atoms for keyed reads.** `Atom.family((id) => atom)` returns
  stable identity per key with `Equal`-based equality. Branded ids and
  Effect-native data types work out of the box; Query asks you to choose a
  string serialization for `queryKey`.
- **Less code per repository.** Define `byId`, `byIdLive`, `list`,
  `listLive`, and mutation atoms once at module scope. Query needs a
  `useXxx()` hook wrapper per operation.
- **Reactive composition between atoms.** `runtime.atom((get) => /* read other atoms */)`.
  Query has `enabled: !!data` + `getQueryData(...)`, which works but is more
  ceremony.

### Where it's a wash

- **Devtools** for Query are great today; for atoms they're early-days.
  This may matter a lot or a little depending on team habits.
- **Mutation invalidation.** Query's `invalidateQueries` is more familiar;
  atoms use `Reactivity` keys + `withReactivity`. Different API, similar
  capability.
- **Suspense.** Both support it. `useAtomSuspense` vs. `useSuspenseQuery`.
- **TypeScript inference.** Both are strong; atoms thread `A | E` through
  `AsyncResult`, Query threads `A` and surfaces `E` as `unknown` by default
  but supports a typed error generic if you discipline yourself.

### Recommendation

**For an `effect-firebase` consumer specifically: use atoms.** The data layer
is already `Effect` + `Stream` end-to-end; Query forces a round-trip through
`Promise<A>` that throws away half of Effect's vocabulary. Live Firestore
queries are streams by nature, and Query's `queryFn` contract genuinely does
not fit them — you end up writing custom stream-subscription glue per query.
Atoms eliminate that glue.

**For a mixed-source app** (Firestore + REST + a third-party SDK), the answer
is less clear. If most of your reads still come from Effect, atoms are still
the better fit and you wrap non-Effect calls in `Effect.tryPromise`. If most
of your reads are non-Effect HTTP, Query is justified for those and you can
bridge atoms in for the Firestore parts via the never-resolving-`queryFn`
trick above — but at that point you have two cache systems and should pick
one.

**For a team unfamiliar with Effect** and rolling out Effect gradually: Query
is the safer onboarding path. Adopt it for now, migrate to atoms once the
team is fluent in Effect and the Atom API has stabilized out of `unstable/`.

**For maximum stability today:** Query. It's 1.x, has years of production
mileage, and isn't gated on Effect v4 going stable. Atoms are pre-1.0 and
lockstep-pinned to Effect betas — expect to bump them together and re-read
release notes.

---

## 8. Caveats

- **`@effect/atom-react` is lockstep with `effect` betas.** Each release of
  `@effect/atom-react@4.0.0-beta.N` peer-depends on `effect@^4.0.0-beta.N`. Bump
  them together.
- **Layer identity matters.** The runtime is rebuilt whenever the layer
  identity changes in the registry. Always memoize the production layer.
- **Atom families key by `Equal` equality.** Branded ids work out of the box;
  object keys need to be either `Equal`-implementing classes or pre-serialized
  to a stable string before passing to a family.
- **Subscriptions are refcounted.** When the last subscriber to a Stream atom
  unmounts, the stream is paused after an idle TTL (configurable on
  `RegistryProvider`). On re-mount within the TTL, the cached value renders
  immediately while a fresh stream spins up.
- **`unstable/reactivity` is unstable.** The Atom module lives in Effect's
  `unstable/` namespace until v4 stable. Treat API churn between betas as
  possible — pin tightly and update intentionally.
