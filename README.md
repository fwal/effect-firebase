# Effect Firebase

Type-safe Firebase integration for [Effect](https://effect.website), providing schemas, models, and utilities for building Firebase applications with Effect's powerful ecosystem.

[![npm version](https://img.shields.io/npm/v/effect-firebase.svg)](https://www.npmjs.com/package/effect-firebase)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> [!WARNING]
> This project is still under heavy development and APIs may change frequently.

## Overview

Effect Firebase is a comprehensive library for integrating Firebase services with Effect, providing:

- 🔒 **Type-Safe APIs** - Leverage TypeScript and Effect schemas for complete type safety
- 📦 **Model & Repository Pattern** - Clean abstractions for data access with automatic validation
- 🔍 **Type-Safe Queries** - Fluent query builder with compile-time field validation
- 🎯 **SDK Agnostic Core** - Works with both Firebase Admin SDK and Client SDK
- 🧪 **Testable** - Mock implementations for fast, isolated testing
- 🚀 **Effect Native** - Built on Effect's composition and error handling

## Packages

This monorepo contains several packages for different use cases:

| Package                                           | Description                                                 | Version                                                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [**effect-firebase**](./packages/effect-firebase) | Core library with schemas, models, and abstractions         | [![npm](https://img.shields.io/npm/v/effect-firebase.svg)](https://www.npmjs.com/package/effect-firebase)                 |
| [**@effect-firebase/admin**](./packages/admin)    | Firebase Admin SDK implementation + Cloud Functions support | [![npm](https://img.shields.io/npm/v/@effect-firebase/admin.svg)](https://www.npmjs.com/package/@effect-firebase/admin)   |
| [**@effect-firebase/client**](./packages/client)  | Firebase Client SDK implementation for web/mobile apps      | [![npm](https://img.shields.io/npm/v/@effect-firebase/client.svg)](https://www.npmjs.com/package/@effect-firebase/client) |
| [**@effect-firebase/mock**](./packages/mock)      | Mock implementation for testing                             | [![npm](https://img.shields.io/npm/v/@effect-firebase/mock.svg)](https://www.npmjs.com/package/@effect-firebase/mock)     |

## Quick Start

### Installation

Choose the packages you need based on your use case:

```bash
# Core library (required)
npm install effect-firebase effect @effect/experimental

# For server/admin applications or Cloud Functions
npm install @effect-firebase/admin firebase-admin firebase-functions

# For client applications (web/mobile)
npm install @effect-firebase/client firebase

# For testing (dev dependency)
npm install --save-dev @effect-firebase/mock
```

### Example: Building a Blog

#### 1. Define Your Model

```typescript
import { Schema } from 'effect';
import { Model } from 'effect-firebase';

const PostId = Schema.String.pipe(Schema.brand('PostId'));
const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));
const AuthorRef = Model.Reference(AuthorId, 'authors');

class PostModel extends Model.Class<PostModel>('PostModel')({
  id: Model.Generated(PostId),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
  author: AuthorRef,
  title: Schema.String,
  content: Schema.String,
  status: Schema.Literal('draft', 'published'),
  likes: Schema.Number,
}) {}
```

#### 2. Create a Repository

```typescript
import { Effect } from 'effect';
import { Model, Query } from 'effect-firebase';

export const PostRepository = Model.makeRepository(PostModel, {
  collectionPath: 'posts',
  idField: 'id',
  spanPrefix: 'app.PostRepository',
}).pipe(
  Effect.map((repository) => ({
    ...repository,
    // Add custom methods
    publishedPosts: () =>
      repository.queryStream(
        Query.and(
          Query.where('status', '==', 'published'),
          Query.orderBy('createdAt', 'desc')
        )
      ),
  }))
);
```

#### 3. Use in Your Application

**Client Application:**

```typescript
import { Effect } from 'effect';
import { Client } from '@effect-firebase/client';
import { PostRepository } from './repositories/post-repository';

const program = Effect.gen(function* () {
  const repo = yield* PostRepository;

  // Create a post
  const postId = yield* repo.add({
    title: 'Hello Effect Firebase',
    content: 'Building type-safe apps',
    author: AuthorId.make('author-123'),
    status: 'published',
    likes: 0,
  });

  // Query posts
  const posts = yield* repo.query(Query.where('status', '==', 'published'));

  return { postId, posts };
}).pipe(Effect.provide(PostRepository), Effect.provide(Client.layer));

Effect.runPromise(program).then(console.log);
```

**Cloud Function:**

```typescript
import { Effect } from 'effect';
import { Admin, onCallEffect, makeRuntime } from '@effect-firebase/admin';
import { PostRepository } from './repositories/post-repository';

const runtime = makeRuntime(Layer.mergeAll(Admin.layer, PostRepository));

export const createPost = onCallEffect({ runtime }, (request) =>
  Effect.gen(function* () {
    const repo = yield* PostRepository;
    const { title, content } = request.data;

    const postId = yield* repo.add({
      title,
      content,
      author: AuthorId.make(request.auth!.uid),
      status: 'draft',
      likes: 0,
    });

    return { postId };
  })
);
```

**Testing:**

```typescript
import { Effect } from 'effect';
import { layer as mockFirestore } from '@effect-firebase/mock';

const test = Effect.gen(function* () {
  const repo = yield* PostRepository;

  const postId = yield* repo.add({
    title: 'Test Post',
    content: 'Test Content',
    author: AuthorId.make('test-author'),
    status: 'draft',
    likes: 0,
  });

  const post = yield* repo.getById(postId);
  expect(post.title).toBe('Test Post');
}).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore));

await Effect.runPromise(test);
```

## Features

### Firestore

#### ✅ Schema Support

Platform-agnostic schemas for Firestore types:

- `Timestamp` (including server timestamps)
- `GeoPoint`
- `DocumentReference`

#### ✅ Model & Repository

- Type-safe CRUD operations
- Automatic schema validation
- Generated fields (IDs, timestamps)
- Custom repository methods
- Real-time streaming support

#### ✅ Type-Safe Queries

- Field validation at compile time
- Fluent query builder API
- Support for all Firestore operators
- Composite queries (AND/OR)
- Pagination support
- Ordering and limiting

### Cloud Functions (Admin)

- `onRequest` - HTTP endpoints
- `onCall` - Callable functions
- `onDocumentCreated` - Firestore trigger
- `onDocumentUpdated` - Firestore trigger
- `onDocumentDeleted` - Firestore trigger
- `onDocumentWritten` - Firestore trigger

### Planned Features

- 🔄 Firebase Realtime Database support
- 🔄 Firebase Storage integration
- 🔄 Firebase Data Connect support
- 🔄 Additional Cloud Functions triggers

## Documentation

Each package has comprehensive documentation:

- **[effect-firebase](./packages/effect-firebase/README.md)** - Core classes, schemas, models, queries
- **[@effect-firebase/admin](./packages/admin/README.md)** - Server-side usage i.e. Cloud Functions
- **[@effect-firebase/client](./packages/client/README.md)** - Client-side usage
- **[@effect-firebase/mock](./packages/mock/README.md)** - Testing guide

## Why Effect Firebase?

### Type Safety

Traditional Firebase code:

```typescript
// ❌ No type safety
const posts = await db
  .collection('posts')
  .where('staus', '==', 'published') // Typo! Runtime error
  .get();

posts.forEach((doc) => {
  const data = doc.data(); // any type
  console.log(data.titel); // Typo! No error
});
```

With Effect Firebase:

```typescript
// ✅ Compile-time type safety
const posts =
  yield *
  repo.query(
    Query.where('status', '==', 'published') // Compile error if field doesn't exist
  );

posts.forEach((post) => {
  console.log(post.title); // Fully typed - IDE autocomplete works
  // post.titel // Compile error
});
```

### Error Handling

Traditional Firebase:

```typescript
// ❌ Error handling is manual and inconsistent
try {
  const doc = await db.collection('posts').doc(id).get();
  if (!doc.exists) {
    throw new Error('Not found');
  }
  const data = doc.data();
  // What if data is invalid?
} catch (error) {
  // What type is error?
  console.error(error);
}
```

With Effect Firebase:

```typescript
// ✅ Structured error handling with Effect
const program = repo.getById(id).pipe(
  Effect.catchTag('NoSuchElementException', () => Effect.succeed(null)),
  Effect.catchTag('ParseError', (error) =>
    Effect.fail(new ValidationError({ cause: error }))
  ),
  Effect.catchTag('FirestoreError', (error) =>
    Effect.fail(new DatabaseError({ cause: error }))
  )
);
```

### Composability

```typescript
// ✅ Compose operations easily with Effect
const program = Effect.gen(function* () {
  const postRepo = yield* PostRepository;
  const userRepo = yield* UserRepository;

  // Get user and their posts in parallel
  const [user, posts] = yield* Effect.all(
    [
      userRepo.getById(userId),
      postRepo.query(Query.where('authorId', '==', userId)),
    ],
    { concurrency: 'unbounded' }
  );

  return { user, posts };
});
```

## Requirements

- **Effect**: ^3.19.8
- **@effect/experimental**: ^0.57.10
- **TypeScript**: 5.x
- **Firebase**: Admin SDK ^13.4.0 or Client SDK ^12.0.0

## Development

This project uses [Nx](https://nx.dev) for monorepo management.

### Setup

```bash
# Clone the repository
git clone https://github.com/fwal/effect-firebase.git
cd effect-firebase

# Install dependencies
pnpm install
```

### Build

```bash
# Build all packages
nx run-many -t build

# Build specific package
nx build effect-firebase
```

### Test

```bash
# Run all tests
nx run-many -t test

# Test specific package
nx test effect-firebase
```

### Example Application

The repository includes a full example application demonstrating all features:

```bash
# Terminal 1: Start Firebase emulators
pnpm example:emulator

# Terminal 2: Start the example app
pnpm example:hosting
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

## Resources

- [Effect Documentation](https://effect.website)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Repository](https://github.com/fwal/effect-firebase)
- [Issue Tracker](https://github.com/fwal/effect-firebase/issues)

## Acknowledgments

Built with:

- [Effect](https://effect.website) - Powerful TypeScript framework
- [Firebase](https://firebase.google.com) - Application development platform
- [Nx](https://nx.dev) - Smart monorepo tooling

The Model and Repository pattern is heavily inspired by the excellent [`@effect/sql`](https://github.com/Effect-TS/effect/tree/main/packages/sql) family of packages, adapted for Firestore's document-based paradigm.

---

**Questions or feedback?** Open an issue on [GitHub](https://github.com/fwal/effect-firebase/issues)!
