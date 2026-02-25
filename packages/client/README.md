# @effect-firebase/client

Firebase Client SDK integration for Effect Firebase. This package provides the FirestoreService implementation for web and mobile applications.

## Features

- 🔥 **Firebase Client SDK Integration** - Complete FirestoreService implementation
- 🔄 **Effect Native** - Built on Effect's powerful composition and error handling

## Installation

```bash
npm install @effect-firebase/client effect-firebase effect @effect/experimental
npm install firebase
```

## Quick Start

### Use in Your Application

```typescript
import { Effect } from 'effect';
import { initializeApp } from 'firebase/app';
import { Client } from '@effect-firebase/client';
import { PostRepository } from './repositories/post-repository';
import { Query } from 'effect-firebase';

const app = initializeApp({
  projectId: 'your-project-id',
});

// Create your application with the Client layer
const program = Effect.gen(function* () {
  const repo = yield* PostRepository;

  // Query posts
  const posts = yield* repo.query(
    Query.and(
      Query.where('status', '==', 'published'),
      Query.orderBy('createdAt', 'desc'),
      Query.limit(10)
    )
  );

  return posts;
}).pipe(
  Effect.provide(PostRepository),
  Effect.provide(Client.layer({ app })) // Provides FirestoreService
);

// Run the effect
Effect.runPromise(program).then(console.log);
```

## API Reference

### Client

- `Client.layer(options?)` - Layer providing FirestoreService for the Firebase Client SDK
- `Client.layer()` - Uses the default initialized Firebase app
- `Client.layer({ app })` - Uses the provided Firebase app
- `Client.layer({ firestore })` - Uses the provided Firestore instance directly

## Documentation

For core concepts, schemas, models, and queries, see the [effect-firebase documentation](../effect-firebase/README.md).

## License

MIT

## Resources

- [Firebase Client SDK](https://firebase.google.com/docs/web/setup)
- [Firebase Auth](https://firebase.google.com/docs/auth)
- [Effect Documentation](https://effect.website)
- [Main Repository](https://github.com/fwal/effect-firebase)
