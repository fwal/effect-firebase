# @effect-firebase/react-native

React Native Firebase integration for Effect Firebase. Provides a `FirestoreService` implementation backed by [`@react-native-firebase`](https://rnfirebase.io) for use in React Native applications.

## Installation

```bash
npm install @effect-firebase/react-native effect-firebase effect
npm install @react-native-firebase/app @react-native-firebase/firestore
```

Requires `@react-native-firebase/*` v24 or later (the modular API). The Firebase app is configured natively (via `google-services.json` / `GoogleService-Info.plist`) — no JavaScript `initializeApp` call is needed.

## Usage

```typescript
import { Effect } from 'effect';
import { Client } from '@effect-firebase/react-native';
import { PostRepository } from './repositories/post-repository';
import { Query } from 'effect-firebase';

const program = Effect.gen(function* () {
  const repo = yield* PostRepository;
  const posts = yield* repo.query(
    Query.and(
      Query.where('status', '==', 'published'),
      Query.orderBy('createdAt', 'desc'),
      Query.limit(10),
    ),
  );
  return posts;
}).pipe(Effect.provide(PostRepository), Effect.provide(Client.layer()));

Effect.runPromise(program).then(console.log);
```

## Layer options

```typescript
Client.layer(); // uses the default (natively configured) Firebase app
Client.layer({ app }); // uses the provided app from getApp()
Client.layer({ firestore }); // uses a Firestore instance directly
```

## License

MIT
