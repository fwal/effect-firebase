# @effect-firebase/mock

An in-memory, reactive `FirestoreService` implementation for testing and developing Effect Firebase applications. No Firebase connection required.

Beyond a plain test double, the mock is a small simulated backend built for **developer experience**:

- **Fixtures** — seed hard-coded models through your real schemas, so reads exercise the exact decoding path production data takes.
- **Reactive streams** — `streamDoc` / `streamQuery` are live: writes and runtime toggles push new emissions through already-subscribed streams, just like `onSnapshot`.
- **Simulated states** — flip any collection between `data`, `empty`, `loading` and `error` at runtime with the `MockController`, and watch your UI's spinner, empty and error paths render with no backend involved.
- **Latency simulation** — add artificial delay to every operation.
- **Write fidelity** — server timestamps materialize on write, `delete`/`arrayUnion`/`arrayRemove` sentinels are honored, and queries (where, orderBy, cursors, limits) are evaluated in-process.

## Installation

```bash
npm install --save-dev @effect-firebase/mock
```

## Usage

Provide `layer` in place of the real Admin or Client layer:

```typescript
import { Effect } from 'effect';
import { layer as mockFirestore } from '@effect-firebase/mock';

await Effect.runPromise(
  Effect.gen(function* () {
    const repo = yield* PostRepository;

    const postId = yield* repo.add({
      title: 'Test',
      content: '...',
      status: 'draft',
    });
    const post = yield* repo.getById(postId);
    expect(post.title).toBe('Test');
  }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore()))
);
```

Each `Effect.provide(layer())` call gets a fresh in-memory store, so tests are isolated by default.

## Fixtures

Seed the backend with hard-coded models. Documents are encoded through the model's schema, so `getById`, `query` and streams decode them exactly like real data:

```typescript
import { fixture, layer } from '@effect-firebase/mock';
import { DateTime } from 'effect';

const posts = fixture(PostModel, {
  collectionPath: 'posts',
  idField: 'id',
  docs: [
    new PostModel({
      id: PostId.make('1'),
      title: 'Hello world',
      content: '...',
      createdAt: DateTime.makeUnsafe('2024-01-01'),
      // ...
    }),
  ],
});

const mock = layer({ fixtures: [posts] });
```

For documents without a model schema, use `rawFixture` with already-encoded data:

```typescript
import { rawFixture } from '@effect-firebase/mock';

const settings = rawFixture('settings', {
  general: { theme: 'dark' },
});
```

## Simulated states

The layer also provides a `MockController` service for driving the backend at runtime — from tests, a dev panel, or a devtools plugin:

```typescript
import { layer, MockController, MockState } from '@effect-firebase/mock';

Effect.gen(function* () {
  const controller = yield* MockController;

  // Live streams re-emit immediately:
  yield* controller.setState('posts', 'empty');
  yield* controller.setState('posts', 'loading'); // reads hang, streams go silent
  yield* controller.setState('posts', 'error'); // reads/writes fail: code 'unavailable'
  yield* controller.setState('posts', MockState.error('permission-denied'));
  yield* controller.setState('posts', 'data'); // back to normal

  // Apply to every collection at once:
  yield* controller.setState(MockState.All, 'loading');

  // Other controls:
  yield* controller.setLatency('300 millis');
  yield* controller.seed(morePosts);
  yield* controller.reset;
});
```

States can also be set up front:

```typescript
const mock = layer({
  fixtures: [posts],
  states: { comments: 'loading' },
  latency: '200 millis',
});
```

## Driving the backend from outside Effect

`make()` returns a handle instead of just a layer: the same options as `layer()`, plus direct access to the controller as a plain value. Every controller effect requires no services, so React components, Storybook decorators or test helpers can run them with `Effect.runPromise` directly. This is what the [`@effect-firebase/devtools`](../devtools) panel builds on:

```typescript
import { make } from '@effect-firebase/mock';

const mock = make({ fixtures: [posts] });

// Provide mock.layer to your app runtime (all provides share one store)...
const runtime = Atom.runtime(mock.layer);

// ...and drive the same store from anywhere:
await Effect.runPromise(mock.controller.setState('posts', 'loading'));
```

Notes on semantics:

- `empty` affects reads only; writes still land in the store.
- `loading` suspends reads *and* writes, and live streams stop emitting. A stream subscribed while loading emits nothing until the state flips.
- `error` fails effects per call. A live stream fails **terminally** (matching `onSnapshot` semantics) — consumers must re-subscribe after the state recovers, e.g. by refreshing the atom/query that owns the stream.

## Multiple repositories

```typescript
const testLayer = Layer.mergeAll(PostRepository, UserRepository).pipe(
  Layer.provideMerge(layer({ fixtures: [posts, users] }))
);
```

## Error handling

```typescript
await Effect.runPromise(
  Effect.gen(function* () {
    const repo = yield* PostRepository;
    yield* repo.getById('nonexistent');
  }).pipe(
    Effect.provide(PostRepository),
    Effect.provide(layer()),
    Effect.catchTag('NoSuchElementError', () => Effect.succeed('not found'))
  )
);
```

## Limitations

- In-memory only — no persistence between process restarts
- Queries are evaluated in-process — behaviour may differ from real Firestore for edge cases (composite index requirements are not enforced, `not-in`/`!=` null semantics are simplified)
- Simulated states are keyed per collection path (or the `'*'` wildcard), not per query
- No security rules evaluation
- No transaction support
- No multi-client synchronization

For tests that need full Firestore semantics, use the [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite).

## License

MIT
