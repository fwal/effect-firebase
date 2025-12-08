# @effect-firebase/mock

Mock implementation of FirestoreService for testing Effect Firebase applications. Provides an in-memory implementation that mimics Firestore behavior without requiring actual Firebase connections.

> [!WARNING]
> This project is still under heavy development and APIs may change frequently.

## Features

- 🧪 **In-Memory Storage** - No Firebase connection required
- 🔄 **Complete API Support** - All FirestoreService methods implemented
- ⚡ **Fast Tests** - No network latency
- 🎯 **Type-Safe** - Full TypeScript support
- 📦 **Zero Config** - Drop-in replacement for real implementations

## Installation

```bash
npm install --save-dev @effect-firebase/mock
```

## Quick Start

### Basic Test Setup

```typescript
import { Effect, Layer } from 'effect';
import { layer as mockFirestore } from '@effect-firebase/mock';
import { PostRepository } from './repositories/post-repository';

// Create test layer
const testLayer = Layer.provide(PostRepository, mockFirestore);

// Run tests
const test = Effect.gen(function* () {
  const repo = yield* PostRepository;

  // Add a post
  const postId = yield* repo.add({
    title: 'Test Post',
    content: 'Test Content',
    status: 'draft',
    likes: 0,
  });

  // Retrieve it
  const post = yield* repo.getById(postId);

  // Assert
  expect(post.title).toBe('Test Post');
  expect(post.status).toBe('draft');

  return post;
}).pipe(Effect.provide(testLayer));

// Execute test
await Effect.runPromise(test);
```

## Testing CRUD Operations

### Create

```typescript
import { Effect } from 'effect';
import { layer as mockFirestore } from '@effect-firebase/mock';

describe('PostRepository', () => {
  it('should create a post', async () => {
    const program = Effect.gen(function* () {
      const repo = yield* PostRepository;

      const postId = yield* repo.add({
        title: 'New Post',
        content: 'Content here',
        status: 'published',
        likes: 0,
      });

      expect(postId).toBeDefined();
      expect(typeof postId).toBe('string');

      return postId;
    }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore));

    await Effect.runPromise(program);
  });
});
```

### Read

```typescript
describe('PostRepository', () => {
  it('should read a post', async () => {
    const program = Effect.gen(function* () {
      const repo = yield* PostRepository;

      // Create
      const postId = yield* repo.add({
        title: 'Test Post',
        content: 'Content',
        status: 'draft',
        likes: 0,
      });

      // Read
      const post = yield* repo.getById(postId);

      expect(post).toMatchObject({
        id: postId,
        title: 'Test Post',
        status: 'draft',
      });
    }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore));

    await Effect.runPromise(program);
  });

  it('should fail when post not found', async () => {
    const program = Effect.gen(function* () {
      const repo = yield* PostRepository;
      yield* repo.getById('nonexistent');
    }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore));

    await expect(Effect.runPromise(program)).rejects.toThrow();
  });
});
```

### Update

```typescript
describe('PostRepository', () => {
  it('should update a post', async () => {
    const program = Effect.gen(function* () {
      const repo = yield* PostRepository;

      // Create
      const postId = yield* repo.add({
        title: 'Original Title',
        content: 'Content',
        status: 'draft',
        likes: 0,
      });

      // Update
      yield* repo.update({
        id: postId,
        title: 'Updated Title',
        status: 'published',
      });

      // Verify
      const post = yield* repo.getById(postId);
      expect(post.title).toBe('Updated Title');
      expect(post.status).toBe('published');
      expect(post.content).toBe('Content'); // Unchanged
    }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore));

    await Effect.runPromise(program);
  });
});
```

### Delete

```typescript
describe('PostRepository', () => {
  it('should delete a post', async () => {
    const program = Effect.gen(function* () {
      const repo = yield* PostRepository;

      // Create
      const postId = yield* repo.add({
        title: 'To Delete',
        content: 'Content',
        status: 'draft',
        likes: 0,
      });

      // Delete
      yield* repo.remove(postId);

      // Verify it's gone
      const result = yield* repo.findById(postId);
      expect(result._tag).toBe('None');
    }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore));

    await Effect.runPromise(program);
  });
});
```

## Testing Queries

### Where Clauses

```typescript
describe('PostRepository queries', () => {
  it('should filter by status', async () => {
    const program = Effect.gen(function* () {
      const repo = yield* PostRepository;

      // Create posts with different statuses
      yield* repo.add({
        title: 'Draft 1',
        content: 'C',
        status: 'draft',
        likes: 0,
      });
      yield* repo.add({
        title: 'Published 1',
        content: 'C',
        status: 'published',
        likes: 0,
      });
      yield* repo.add({
        title: 'Draft 2',
        content: 'C',
        status: 'draft',
        likes: 0,
      });

      // Query published posts
      const published = yield* repo.query(
        Query.where('status', '==', 'published')
      );

      expect(published).toHaveLength(1);
      expect(published[0].title).toBe('Published 1');
    }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore));

    await Effect.runPromise(program);
  });

  it('should filter by numeric comparison', async () => {
    const program = Effect.gen(function* () {
      const repo = yield* PostRepository;

      yield* repo.add({
        title: 'Post 1',
        content: 'C',
        status: 'published',
        likes: 5,
      });
      yield* repo.add({
        title: 'Post 2',
        content: 'C',
        status: 'published',
        likes: 15,
      });
      yield* repo.add({
        title: 'Post 3',
        content: 'C',
        status: 'published',
        likes: 25,
      });

      // Get posts with 10+ likes
      const popular = yield* repo.query(Query.where('likes', '>=', 10));

      expect(popular).toHaveLength(2);
    }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore));

    await Effect.runPromise(program);
  });
});
```

### Ordering and Limits

```typescript
describe('PostRepository queries', () => {
  it('should order and limit results', async () => {
    const program = Effect.gen(function* () {
      const repo = yield* PostRepository;

      // Create posts with different like counts
      yield* repo.add({
        title: 'Post A',
        content: 'C',
        status: 'published',
        likes: 5,
      });
      yield* repo.add({
        title: 'Post B',
        content: 'C',
        status: 'published',
        likes: 15,
      });
      yield* repo.add({
        title: 'Post C',
        content: 'C',
        status: 'published',
        likes: 25,
      });
      yield* repo.add({
        title: 'Post D',
        content: 'C',
        status: 'published',
        likes: 10,
      });

      // Get top 2 most liked posts
      const top = yield* repo.query(
        Query.and(Query.orderBy('likes', 'desc'), Query.limit(2))
      );

      expect(top).toHaveLength(2);
      expect(top[0].title).toBe('Post C'); // 25 likes
      expect(top[1].title).toBe('Post B'); // 15 likes
    }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore));

    await Effect.runPromise(program);
  });
});
```

### Complex Queries

```typescript
describe('PostRepository queries', () => {
  it('should handle complex AND queries', async () => {
    const program = Effect.gen(function* () {
      const repo = yield* PostRepository;

      yield* repo.add({
        title: 'Draft A',
        content: 'C',
        status: 'draft',
        likes: 15,
      });
      yield* repo.add({
        title: 'Published A',
        content: 'C',
        status: 'published',
        likes: 5,
      });
      yield* repo.add({
        title: 'Published B',
        content: 'C',
        status: 'published',
        likes: 15,
      });
      yield* repo.add({
        title: 'Published C',
        content: 'C',
        status: 'published',
        likes: 25,
      });

      // Get published posts with 10+ likes
      const results = yield* repo.query(
        Query.and(
          Query.where('status', '==', 'published'),
          Query.where('likes', '>=', 10),
          Query.orderBy('likes', 'desc')
        )
      );

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Published C');
      expect(results[1].title).toBe('Published B');
    }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore));

    await Effect.runPromise(program);
  });
});
```

## Testing Streams

```typescript
import { Stream } from 'effect';

describe('PostRepository streams', () => {
  it('should stream query results', async () => {
    const program = Effect.gen(function* () {
      const repo = yield* PostRepository;

      // Create some posts
      yield* repo.add({
        title: 'Post 1',
        content: 'C',
        status: 'published',
        likes: 0,
      });
      yield* repo.add({
        title: 'Post 2',
        content: 'C',
        status: 'published',
        likes: 0,
      });

      // Get stream
      const stream = yield* repo.queryStream(
        Query.where('status', '==', 'published')
      );

      // Collect results
      const results = yield* Stream.runCollect(stream);
      const posts = results.pipe(Array.from);

      // First emission should have 2 posts
      expect(posts[0]).toHaveLength(2);
    }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore));

    await Effect.runPromise(program);
  });
});
```

## Testing with Multiple Repositories

```typescript
import { Effect, Layer } from 'effect';
import { layer as mockFirestore } from '@effect-firebase/mock';

describe('Multiple repositories', () => {
  it('should work with multiple repositories', async () => {
    const testLayer = Layer.mergeAll(
      mockFirestore,
      PostRepository,
      UserRepository
    );

    const program = Effect.gen(function* () {
      const postRepo = yield* PostRepository;
      const userRepo = yield* UserRepository;

      // Create a user
      const userId = yield* userRepo.add({
        name: 'John Doe',
        email: 'john@example.com',
      });

      // Create a post by that user
      const postId = yield* postRepo.add({
        title: 'User Post',
        content: 'Content',
        authorId: userId,
        status: 'draft',
        likes: 0,
      });

      // Verify
      const post = yield* postRepo.getById(postId);
      expect(post.authorId).toBe(userId);
    }).pipe(Effect.provide(testLayer));

    await Effect.runPromise(program);
  });
});
```

## Testing Error Handling

```typescript
describe('Error handling', () => {
  it('should handle not found errors', async () => {
    const program = Effect.gen(function* () {
      const repo = yield* PostRepository;

      yield* repo.getById('nonexistent');
    }).pipe(
      Effect.provide(PostRepository),
      Effect.provide(mockFirestore),
      Effect.catchTag('NoSuchElementException', () => Effect.succeed('handled'))
    );

    const result = await Effect.runPromise(program);
    expect(result).toBe('handled');
  });

  it('should use findById for optional results', async () => {
    const program = Effect.gen(function* () {
      const repo = yield* PostRepository;

      const result = yield* repo.findById('nonexistent');

      expect(result._tag).toBe('None');
    }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore));

    await Effect.runPromise(program);
  });
});
```

## Testing Frameworks

### Jest

```typescript
import { Effect } from 'effect';
import { layer as mockFirestore } from '@effect-firebase/mock';
import { PostRepository } from './repositories/post-repository';

describe('PostRepository', () => {
  it('should create and retrieve a post', async () => {
    const program = Effect.gen(function* () {
      const repo = yield* PostRepository;
      const postId = yield* repo.add({
        title: 'Test',
        content: 'Content',
        status: 'draft',
        likes: 0,
      });
      return yield* repo.getById(postId);
    }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore));

    const post = await Effect.runPromise(program);
    expect(post.title).toBe('Test');
  });
});
```

### Vitest

```typescript
import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { layer as mockFirestore } from '@effect-firebase/mock';

describe('PostRepository', () => {
  it('should create and retrieve a post', async () => {
    const program = Effect.gen(function* () {
      const repo = yield* PostRepository;
      const postId = yield* repo.add({
        title: 'Test',
        content: 'Content',
        status: 'draft',
        likes: 0,
      });
      return yield* repo.getById(postId);
    }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore));

    const post = await Effect.runPromise(program);
    expect(post.title).toBe('Test');
  });
});
```

## Limitations

The mock implementation is designed for testing and has some limitations compared to real Firestore:

1. **In-Memory Only** - Data is lost when the process ends
2. **No Transactions** - Transaction support is simplified
3. **Simplified Queries** - Some advanced query features may behave differently
4. **No Security Rules** - Security rules are not evaluated
5. **No Indexes** - All queries work without index configuration
6. **Single Instance** - No multi-client synchronization

For integration testing with real Firestore behavior, consider using the [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite).

## Best Practices

### 1. Isolate Tests

```typescript
// Use separate test layers for each test
describe('PostRepository', () => {
  it('test 1', async () => {
    const program = Effect.gen(function* () {
      // Test logic
    }).pipe(Effect.provide(mockFirestore)); // Fresh instance

    await Effect.runPromise(program);
  });

  it('test 2', async () => {
    const program = Effect.gen(function* () {
      // Test logic
    }).pipe(Effect.provide(mockFirestore)); // Fresh instance

    await Effect.runPromise(program);
  });
});
```

### 2. Test Business Logic, Not Firebase

```typescript
// Good: Tests business logic
it('should calculate post score correctly', async () => {
  const program = Effect.gen(function* () {
    const repo = yield* PostRepository;
    const postId = yield* repo.add({
      /* ... */
    });

    // Test your domain logic
    const score = yield* calculatePostScore(postId);
    expect(score).toBeGreaterThan(0);
  }).pipe(Effect.provide(mockFirestore));

  await Effect.runPromise(program);
});

// Not as useful: Tests Firebase behavior
it('should store data in Firestore', async () => {
  // This is testing the mock, not your code
});
```

### 3. Use Type-Safe Assertions

```typescript
it('should return correctly typed data', async () => {
  const program = Effect.gen(function* () {
    const repo = yield* PostRepository;
    const post = yield* repo.getById('123');

    // TypeScript ensures these properties exist
    expect(post.id).toBeDefined();
    expect(post.title).toBeDefined();
    expect(post.createdAt).toBeInstanceOf(Date);
  }).pipe(Effect.provide(mockFirestore));

  await Effect.runPromise(program);
});
```

## API Reference

### Mock Layer

- `layer` - Layer providing mock FirestoreService implementation

The mock implementation provides all methods from FirestoreService with the same signatures as the real implementations.

## Requirements

- effect ^3.19.8
- effect-firebase ^0.4.0

## Documentation

For core concepts, schemas, models, and queries, see the [effect-firebase documentation](../effect-firebase/README.md).

## License

MIT

## Resources

- [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite)
- [Effect Testing Guide](https://effect.website/docs/guides/testing)
- [Main Repository](https://github.com/fwal/effect-firebase)
