# effect-firebase

Type-safe Firebase integration for [Effect](https://effect.website), providing schemas, models, and utilities for building Firebase applications with Effect's powerful ecosystem.

> [!WARNING]
> This project is still under heavy development and APIs may change frequently.

## Features

- 🔒 **Type-Safe Schemas** - Effect schemas for Firestore types (Timestamp, GeoPoint, DocumentReference)
- 📦 **Model & Repository Pattern** - Type-safe CRUD operations with automatic validation
- 🔍 **Type-Safe Queries** - Fluent query builder with compile-time field validation
- 🎯 **SDK Agnostic** - Works with both Firebase Admin SDK and Client SDK
- 🧪 **Testable** - Mock implementations for testing
- 🚀 **Effect Native** - Built on Effect's powerful composition and error handling

## Installation

```bash
npm install effect-firebase effect @effect/experimental
```

You'll also need a Firebase SDK implementation:

```bash
# For server/admin applications
npm install @effect-firebase/admin firebase-admin

# For client applications
npm install @effect-firebase/client firebase

# For testing
npm install --save-dev @effect-firebase/mock
```

## Quick Start

### 1. Define Your Model

```typescript
import { Schema } from 'effect';
import { Model } from 'effect-firebase';

// Define a branded ID type
const PostId = Schema.String.pipe(Schema.brand('PostId'));

// Create your model with automatic CRUD variants
class PostModel extends Model.Class<PostModel>('PostModel')({
  id: Model.Generated(PostId),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
  title: Schema.String,
  content: Schema.String,
  status: Schema.Literal('draft', 'published'),
  likes: Schema.Number,
}) {}
```

### 2. Create a Repository

```typescript
import { Effect } from 'effect';
import { Model, Query } from 'effect-firebase';

const PostRepository = Model.makeRepository(PostModel, {
  collectionPath: 'posts',
  idField: 'id',
  spanPrefix: 'app.PostRepository',
}).pipe(
  Effect.map((repository) => ({
    ...repository,
    // Add custom queries
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

> **Inspired by @effect/sql:** The repository pattern follows the same principles as [`@effect/sql`](https://github.com/Effect-TS/effect/tree/main/packages/sql), providing a familiar API for Effect developers. If you've used `@effect/sql`, this will feel right at home!

### 3. Use the Repository

```typescript
import { Effect } from 'effect';
import { PostRepository } from './post-repository';

const program = Effect.gen(function* () {
  const repo = yield* PostRepository;

  // Add a new post
  const postId = yield* repo.add({
    title: 'Hello Effect Firebase',
    content: 'Building type-safe Firebase apps with Effect',
    status: 'draft',
    likes: 0,
  });

  // Get a post by ID
  const post = yield* repo.getById(postId);

  // Update a post
  yield* repo.update({
    id: postId,
    status: 'published',
  });

  // Query posts
  const publishedPosts = yield* repo.query(
    Query.where('status', '==', 'published')
  );

  // Stream posts in real-time
  const stream = yield* repo.publishedPosts();

  return { post, publishedPosts };
});
```

## Core Concepts

### FirestoreService

The core interface that all implementations must provide. It defines operations for interacting with Firestore:

```typescript
interface FirestoreService {
  readonly get: (
    path: string
  ) => Effect.Effect<Option<Snapshot>, FirestoreError>;
  readonly add: (
    path: string,
    data: unknown
  ) => Effect.Effect<Reference, FirestoreError>;
  readonly set: (
    path: string,
    data: unknown
  ) => Effect.Effect<void, FirestoreError>;
  readonly update: (
    path: string,
    data: unknown
  ) => Effect.Effect<void, FirestoreError>;
  readonly remove: (path: string) => Effect.Effect<void, FirestoreError>;
  readonly query: (
    path: string,
    ...constraints: QueryConstraint[]
  ) => Effect.Effect<ReadonlyArray<Snapshot>, FirestoreError>;
  readonly queryStream: (
    path: string,
    ...constraints: QueryConstraint[]
  ) => Stream<ReadonlyArray<Snapshot>, FirestoreError>;
  // ... and more
}
```

### Schemas

Effect Firebase provides schemas for Firestore-specific types:

#### Timestamp

```typescript
import { FirestoreSchema } from 'effect-firebase';
import { Schema } from 'effect';

class EventModel extends Schema.Class<EventModel>('EventModel')({
  // Automatically converts Date <-> Firestore Timestamp
  scheduledAt: FirestoreSchema.Timestamp,

  // Server timestamp on creation
  createdAt: FirestoreSchema.ServerTimestamp,
}) {}
```

#### GeoPoint

```typescript
import { FirestoreSchema } from 'effect-firebase';
import { Schema } from 'effect';

class LocationModel extends Schema.Class<LocationModel>('LocationModel')({
  // Stores { latitude: number, longitude: number } as Firestore GeoPoint
  coordinates: FirestoreSchema.GeoPoint,
}) {}
```

#### Document References

```typescript
import { FirestoreSchema, Model } from 'effect-firebase';
import { Schema } from 'effect';

const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));
const PostId = Schema.String.pipe(Schema.brand('PostId'));

class PostModel extends Model.Class<PostModel>('PostModel')({
  id: Model.Generated(PostId),
  // Stores DocumentReference in DB, exposes AuthorId in app
  author: Model.Reference(AuthorId, 'authors'),
}) {}

// Or keep full DocumentReference in app layer
class PostWithRefModel extends Model.Class<PostWithRefModel>(
  'PostWithRefModel'
)({
  id: Model.Generated(PostId),
  // Exposes DocumentReference instance in app, AuthorId in JSON
  author: Model.ReferenceAsInstance(AuthorId, 'authors'),
}) {}
```

### Model Variants

Models automatically generate variants for different operations:

```typescript
type PostModel = {
  Type: {
    // Get/Read - all fields including generated ones
    id: PostId;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    content: string;
  };

  add: {
    // Add/Insert - no generated fields
    Type: {
      title: string;
      content: string;
    };
  };

  update: {
    // Update - partial with id required
    Type: {
      id: PostId;
      title?: string;
      content?: string;
    };
  };

  json: {
    // JSON serialization
    Type: {
      id: PostId;
      createdAt: string; // ISO string
      updatedAt: string;
      title: string;
      content: string;
    };
  };
};
```

### Type-Safe Queries

Build queries with compile-time field and type checking:

```typescript
import { Query } from 'effect-firebase';

// Simple where clause
Query.where('status', '==', 'published');

// Combining constraints
Query.and(
  Query.where('status', '==', 'published'),
  Query.where('likes', '>=', 10),
  Query.orderBy('createdAt', 'desc'),
  Query.limit(20)
);

// OR queries
Query.or(
  Query.where('status', '==', 'published'),
  Query.where('status', '==', 'featured')
);

// Pagination
Query.and(
  Query.orderBy('createdAt', 'desc'),
  Query.startAfter(lastDoc),
  Query.limit(10)
);

// Pipeable API
pipe(
  Query.where('status', '==', 'published'),
  Query.addWhere('likes', '>=', 10),
  Query.addOrderBy('createdAt', 'desc')
);
```

### Repository Pattern

Repositories provide a clean API for data access:

```typescript
const repository = {
  // Single document operations
  add: (data: AddType) => Effect<Id>,
  update: (data: UpdateType) => Effect<void>,
  set: (id: Id, data: Type) => Effect<void>,
  remove: (id: Id) => Effect<void>,

  // Retrieval
  getById: (id: Id) => Effect<Type, NoSuchElementException | ParseError | FirestoreError>,
  findById: (id: Id) => Effect<Option<Type>, ParseError | FirestoreError>,

  // Queries
  query: (...constraints: QueryConstraint[]) => Effect<ReadonlyArray<Type>>,
  queryStream: (...constraints: QueryConstraint[]) => Stream<ReadonlyArray<Type>>,

  // Find one
  findOne: (...constraints: QueryConstraint[]) => Effect<Option<Type>>,
  getOne: (...constraints: QueryConstraint[]) => Effect<Type, NoSuchElementException | ...>,
};
```

> **Note:** The Model and Repository pattern is inspired by the [`@effect/sql`](https://github.com/Effect-TS/effect/tree/main/packages/sql) family of packages, adapted for Firestore's document-based data model. If you're familiar with `@effect/sql`, you'll find the API patterns very similar.

## Advanced Features

### Custom Model Fields

```typescript
import { Model } from 'effect-firebase';
import { Schema } from 'effect';

class UserModel extends Model.Class<UserModel>('UserModel')({
  id: Model.Generated(Schema.String.pipe(Schema.brand('UserId'))),

  // Auto-set creation time
  createdAt: Model.DateTimeInsert,

  // Auto-update on every change
  updatedAt: Model.DateTimeUpdate,

  // Custom field with different representations
  email: Model.Field({
    get: Schema.String,
    add: Schema.String,
    update: Schema.optionalWith(Schema.String, { exact: true }),
    json: Schema.String,
  }),
}) {}
```

### Extending Repositories

```typescript
const UserRepository = Model.makeRepository(UserModel, {
  collectionPath: 'users',
  idField: 'id',
  spanPrefix: 'app.UserRepository',
}).pipe(
  Effect.map((repo) => ({
    ...repo,

    // Add custom methods
    findByEmail: (email: string) =>
      repo.findOne(Query.where('email', '==', email)),

    activeUsers: () =>
      repo.queryStream(
        Query.and(
          Query.where('status', '==', 'active'),
          Query.orderBy('lastActive', 'desc')
        )
      ),
  }))
);
```

## Error Handling

All operations return Effect types with proper error channels:

```typescript
import { Effect } from 'effect';

const program = Effect.gen(function* () {
  const repo = yield* PostRepository;

  // Handle specific errors
  const post = yield* repo.getById('post-123').pipe(
    Effect.catchTag('NoSuchElementException', () => Effect.succeed(null)),
    Effect.catchTag('ParseError', (error) =>
      Effect.fail(
        new ApplicationError({ message: 'Invalid data', cause: error })
      )
    )
  );

  return post;
});
```

## Testing

Use the mock implementation for testing:

```typescript
import { FirestoreService } from 'effect-firebase';
import { layer as mockFirestore } from '@effect-firebase/mock';
import { Effect, Layer } from 'effect';

const testLayer = Layer.provide(PostRepository, mockFirestore);

const test = Effect.gen(function* () {
  const repo = yield* PostRepository;

  // Test your logic
  const postId = yield* repo.add({
    title: 'Test Post',
    content: 'Test Content',
    status: 'draft',
    likes: 0,
  });

  const post = yield* repo.getById(postId);
  expect(post.title).toBe('Test Post');
}).pipe(Effect.provide(testLayer));
```

## Platform-Specific Usage

### Server/Admin (Firebase Functions)

See [@effect-firebase/admin](../admin/README.md) for Firebase Admin SDK integration and Cloud Functions support.

### Client (Web/Mobile)

See [@effect-firebase/client](../client/README.md) for Firebase Client SDK integration.

## API Reference

### Model

- `Model.Class` - Create a model class with CRUD variants
- `Model.Generated` - Mark a field as auto-generated (like ID)
- `Model.DateTimeInsert` - Auto-set timestamp on insert
- `Model.DateTimeUpdate` - Auto-update timestamp on modifications
- `Model.Reference` - Document reference field (ID in app, DocumentReference in DB)
- `Model.ReferenceAsInstance` - Document reference field (DocumentReference in app)
- `Model.Field` - Custom field with variant-specific schemas
- `Model.makeRepository` - Create a repository for a model

### Query

- `Query.where` - Filter constraint
- `Query.orderBy` - Sort constraint
- `Query.limit` - Limit results
- `Query.limitToLast` - Limit from end
- `Query.startAt` / `Query.startAfter` - Pagination start
- `Query.endAt` / `Query.endBefore` - Pagination end
- `Query.and` - Combine constraints with AND
- `Query.or` - Combine constraints with OR

### FirestoreSchema

- `FirestoreSchema.Timestamp` - Date <-> Firestore Timestamp
- `FirestoreSchema.ServerTimestamp` - Server timestamp
- `FirestoreSchema.GeoPoint` - Geographic coordinates
- `FirestoreSchema.Reference` - Document reference
- `FirestoreSchema.ReferenceId` - Branded ID with reference path

## Requirements

- Effect ^3.19.8
- @effect/experimental ^0.57.10
- TypeScript 5.x

## License

MIT

## Contributing

Contributions are welcome! Please see the [main repository](https://github.com/fwal/effect-firebase) for guidelines.

## Acknowledgments

The Model and Repository layer is inspired by the [`@effect/sql`](https://github.com/Effect-TS/effect/tree/main/packages/sql) packages, which provide similar patterns for SQL databases. We've adapted these excellent abstractions to work with Firestore's document-based model.

## Resources

- [Effect Documentation](https://effect.website)
- [Firebase Documentation](https://firebase.google.com/docs)
- [GitHub Repository](https://github.com/fwal/effect-firebase)
- [@effect/sql](https://github.com/Effect-TS/effect/tree/main/packages/sql) - SQL integration that inspired our Model/Repository pattern
