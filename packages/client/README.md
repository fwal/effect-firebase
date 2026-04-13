# @effect-firebase/client

Firebase Client SDK integration for Effect Firebase. Provides a `FirestoreService` implementation for use in web and mobile applications.

## Installation

```bash
npm install @effect-firebase/client effect-firebase effect
npm install firebase
```

## Usage

```typescript
import { Effect } from 'effect';
import { initializeApp } from 'firebase/app';
import { Client } from '@effect-firebase/client';
import { PostRepository } from './repositories/post-repository';
import { Query } from 'effect-firebase';

const app = initializeApp({ projectId: 'your-project-id' });

const program = Effect.gen(function* () {
  const repo = yield* PostRepository;
  const posts = yield* repo.query(
    Query.and(
      Query.where('status', '==', 'published'),
      Query.orderBy('createdAt', 'desc'),
      Query.limit(10)
    )
  );
  return posts;
}).pipe(Effect.provide(PostRepository), Effect.provide(Client.layer({ app })));

Effect.runPromise(program).then(console.log);
```

## Layer options

```typescript
Client.layer(); // uses the default initialized Firebase app
Client.layer({ app }); // uses the provided app
Client.layer({ firestore }); // uses a Firestore instance directly
```

## License

MIT
