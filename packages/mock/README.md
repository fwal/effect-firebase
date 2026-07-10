# @effect-firebase/mock

In-memory `FirestoreService` implementation for testing Effect Firebase applications. No Firebase connection required.

## Installation

```bash
npm install --save-dev @effect-firebase/mock
```

## Usage

Provide `mockFirestore` in place of the real Admin or Client layer:

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
  }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore))
);
```

Each `Effect.provide(mockFirestore)` call gets a fresh in-memory store, so tests are isolated by default.

## Multiple repositories

```typescript
const testLayer = Layer.mergeAll(mockFirestore, PostRepository, UserRepository);

await Effect.runPromise(
  Effect.gen(function* () {
    const posts = yield* PostRepository;
    const users = yield* UserRepository;
    // ...
  }).pipe(Effect.provide(testLayer))
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
    Effect.provide(mockFirestore),
    Effect.catchTag('NoSuchElementError', () => Effect.succeed('not found'))
  )
);
```

## Limitations

- In-memory only — no persistence between process restarts
- Queries are evaluated in-process — behaviour may differ from real Firestore for edge cases
- No security rules evaluation
- `withTransaction` and `withBatch` run the effect directly — no retries, no rollback, and no staged writes
- No multi-client synchronization

For tests that need full Firestore semantics, use the [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite).

## License

MIT
