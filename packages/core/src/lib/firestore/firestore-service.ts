import { Effect, Context } from 'effect';

type FirestoreServiceShape = {
  readonly get: (path: string) => Effect.Effect<any>;
};

export class FirestoreService extends Context.Tag(
  '@effect-firebase/FirestoreService'
)<FirestoreService, FirestoreServiceShape>() {}
