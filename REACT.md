# React patterns for `effect-firebase`

This guide shows how to use `effect-firebase` repositories from a React app:
fetching, subscribing to live updates, mutations, validated forms, and tests.
It documents reference code in [`example/app`](./example/app) — copy what fits,
adapt the rest.

> **Status: interim.** Once
> [`@effect-atom/atom-react`](https://github.com/tim-smart/effect-atom) ships
> Effect v4 support, the recommended foundation will switch to it. The hook
> return shape and `RuntimeProvider` API in this guide are deliberately close
> to atom-react's `Result.Result<A, E>` and runtime layer model, so the
> migration is mostly mechanical. Until then, the patterns below are
> ~150 lines of code you own.

## Contents

1. [Runtime setup](#1-runtime-setup)
2. [Reading data](#2-reading-data)
3. [Mutations](#3-mutations)
4. [Forms with validation](#4-forms-with-validation)
5. [Testing with a mock layer](#5-testing-with-a-mock-layer)
6. [Caveats](#6-caveats)
7. [What's next](#7-whats-next)

---

## 1. Runtime setup

Build a `ManagedRuntime` from a Firestore `Layer` at app root and expose it via
React Context. Components read the runtime via `useRuntime()` (rarely needed
directly — the hooks below use it for you).

```tsx
// example/app/src/app/app.tsx
import { useMemo } from 'react';
import { Client } from '@effect-firebase/client';
import { initializeApp } from 'firebase/app';
import { initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { RuntimeProvider } from '../lib/effect-react.js';

export function App({ children }: { children: React.ReactNode }) {
  const layer = useMemo(() => {
    const app = initializeApp({ projectId: 'effect-firebase-example' });
    const firestore = initializeFirestore(app, { ignoreUndefinedProperties: true });
    connectFirestoreEmulator(firestore, 'localhost', 8080);
    return Client.layer({ firestore });
  }, []);

  return <RuntimeProvider layer={layer}>{children}</RuntimeProvider>;
}
```

Two things matter here:

- **Wrap the layer in `useMemo`.** `RuntimeProvider` rebuilds (and disposes) the
  runtime whenever `layer` identity changes. Without `useMemo`, every render
  produces a new layer, and the runtime is torn down on every render — your
  streams will never stabilize.
- **The runtime is disposed automatically** when `<RuntimeProvider>` unmounts.

The full hook module is at
[`example/app/src/lib/effect-react.tsx`](./example/app/src/lib/effect-react.tsx).

## 2. Reading data

### One-shot reads

```tsx
import { Effect } from 'effect';
import { PostRepository } from '@example/shared';
import { useEffectQuery } from '../lib/effect-react.js';

const getPost = (id: PostId) =>
  PostRepository.pipe(Effect.flatMap((r) => r.getById(id)));

function PostView({ id }: { id: PostId }) {
  const result = useEffectQuery(() => getPost(id), [id]);

  if (result._tag === 'Initial') return <Spinner />;
  if (result._tag === 'Failure') return <Error error={result.error} />;
  return <Post post={result.value} />;
}
```

`useEffectQuery(make, deps)`:

- Re-runs the Effect when any `deps` value changes.
- Returns `Result<A, E>` — discriminate on `_tag`: `'Initial' | 'Success' | 'Failure'`.
- Provides a `refetch()` you can call to re-execute on demand.
- Interrupts the in-flight fiber on unmount or deps change (no orphaned work).

### Live subscriptions

```tsx
import { Effect, Stream } from 'effect';
import { useEffectStream } from '../lib/effect-react.js';

const latestPostsStream = () =>
  Stream.unwrap(PostRepository.pipe(Effect.map((r) => r.latestPosts())));

function PostList() {
  const result = useEffectStream(latestPostsStream, []);

  if (result._tag === 'Initial') return <Spinner />;
  if (result._tag === 'Failure') return <Error error={result.error} />;
  return <>{result.value.map((p) => <PostCard key={p.id} post={p} />)}</>;
}
```

`useEffectStream(make, deps)` runs a `Stream`; the result re-renders with each
emission. Cleanup interrupts the fiber on unmount or deps change.

### Why thunk-shaped `make` arguments?

Both hooks take a `() => Effect.Effect<...>` (or `() => Stream.Stream<...>`)
rather than an Effect/Stream value directly. This lets you reference local
variables inside without re-memoizing the Effect — only the `deps` array
controls re-execution. It also matches how
[`@effect-atom/atom-react`](https://github.com/tim-smart/effect-atom) shapes
its atoms, so the migration story is straightforward.

## 3. Mutations

```tsx
import { Effect } from 'effect';
import { useEffectMutation } from '../lib/effect-react.js';

const addPost = (data: typeof PostModel.insert.Type) =>
  PostRepository.pipe(Effect.flatMap((r) => r.add(data)));

function CreatePost() {
  const create = useEffectMutation(addPost);

  return (
    <Button
      isLoading={create.state._tag === 'Initial' ? false : false /* see below */}
      onClick={() => create.mutate({ title: 'Hello', /* ... */ })}
    >
      Create
    </Button>
  );
}
```

`useEffectMutation(make)`:

- Returns `{ mutate, state, reset }`.
- `mutate(...args)` returns a `Promise<A>` — `await` it from a form submit,
  branch on the rejection if you need to handle errors at the call site.
- `state` is a `Result<A, E>` reflecting the last attempt; use it to render
  success or error UI.
- In-flight writes are **not interrupted on unmount** — a half-completed
  Firestore write would be worse than letting it finish. State updates after
  unmount are skipped via a mounted ref.

## 4. Forms with validation

`effect/Schema` implements
[Standard Schema v1](https://github.com/standard-schema/standard-schema), so
[`@tanstack/react-form`](https://tanstack.com/form/latest) accepts an
effect/Schema validator directly.

```tsx
import { Schema } from 'effect';
import { useForm } from '@tanstack/react-form';

const PostFormSchema = Schema.Struct({
  title: Schema.NonEmptyString,
  content: Schema.NonEmptyString,
});

function PostForm() {
  const create = useEffectMutation(addPost);

  const form = useForm({
    defaultValues: { title: '', content: '' },
    validators: { onChange: Schema.toStandardSchemaV1(PostFormSchema) },
    onSubmit: async ({ value }) => {
      await create.mutate({ ...value, /* fill required fields */ });
      form.reset();
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
      <form.Field name="title">
        {(field) => (
          <Input
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            onBlur={field.handleBlur}
            error={field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined}
          />
        )}
      </form.Field>
      {/* ... */}
      <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" disabled={!canSubmit} isLoading={isSubmitting}>
            Create
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
```

Field-level validators take the same form: a single-field
`Schema.toStandardSchemaV1(...)` passed to `validators.onChange` on
`<form.Field>`. No glue helper required.

See [`example/app/src/routes/firestore.tsx`](./example/app/src/routes/firestore.tsx)
for the full pattern, including edit-mode re-keying (`<PostForm key={editing?.id ?? 'new'} />`).

## 5. Testing with a mock layer

`@effect-firebase/mock` exports `MockFirestoreService(overrides)`, which
returns a `Layer<FirestoreService>` whose methods throw by default but accept
per-method overrides. Pass it to `<RuntimeProvider layer={...}>` in tests; the
components under test never change.

```tsx
// example/app/src/__tests__/firestore.test.tsx
import { render, screen } from '@testing-library/react';
import { Stream } from 'effect';
import { MockFirestoreService } from '@effect-firebase/mock';
import { RuntimeProvider } from '../lib/effect-react.js';
import { PostList } from '../routes/firestore.js';

it('renders the empty state when the mock layer yields no posts', async () => {
  const layer = MockFirestoreService({
    streamQuery: () => Stream.make([]),
  });
  render(
    <RuntimeProvider layer={layer}>
      <PostList onEdit={() => undefined} />
    </RuntimeProvider>,
  );
  expect(await screen.findByText(/No posts found/i)).toBeTruthy();
});
```

Vitest needs `environment: 'jsdom'` for React testing — see the
`test` block in [`example/app/vite.config.ts`](./example/app/vite.config.ts).

## 6. Caveats

- **Defects vs typed errors.** `useEffectQuery` / `useEffectStream` surface the
  typed `E` channel; defects (`Effect.die`, thrown JS errors) are logged via
  `console.error` and don't update state. Audit your repository functions to
  ensure failures you want to render are typed, not defects.
- **Stable layer identity.** The runtime is rebuilt whenever the `layer` prop
  identity changes. Always memoize the layer at the boundary.
- **No mutation interruption.** `useEffectMutation` does not interrupt
  in-flight writes when the component unmounts; the post-completion `setState`
  is just skipped. If you need cancellation, expose an `AbortSignal` and
  thread it via `runtime.runPromise(effect, { signal })` in a custom hook.
- **Stream completion vs Initial state.** `useEffectStream` stays in `Initial`
  until the first emission. A stream that emits nothing (e.g. empty Firestore
  query never yields) stays in `Initial` forever. If you need an explicit
  "loaded but empty" state, wrap the stream so it always emits at least once.

## 7. What's next

When [`@effect-atom/atom-react`](https://github.com/tim-smart/effect-atom)
ships Effect v4 support, the recommended foundation will be:

- `Atom.runtime((get) => get(firestoreLayerAtom))` as the runtime binding —
  the layer is itself an atom, so tests can swap it via
  `RegistryProvider.initialValues` instead of a `layer` prop.
- `Atom.family((id) => runtime.atom(repositoryEffect.pipe(Effect.flatMap((r) => r.getByIdStream(id)))))`
  for keyed live atoms — multiple components reading the same id share one
  subscription automatically.
- `Atom.fn(make)` for mutations — no need for a per-component `useEffectMutation`.
- Suspense and error boundaries via `useAtomSuspense`.

The hooks in this guide intentionally avoid features that atom-react covers
better (refcounted subscriptions, suspense, registry-level overrides) so the
migration is bounded. Watch
[tim-smart/effect-atom](https://github.com/tim-smart/effect-atom) for the
v4-compatible release.

**TanStack Query** is not integrated here. For real-time Firestore data,
streams are the source of truth and Query's `queryFn` (which resolves once)
fights the abstraction. If you have a strong reason to bring it in for
non-Firestore data, layer it on top — it doesn't conflict with anything above.
