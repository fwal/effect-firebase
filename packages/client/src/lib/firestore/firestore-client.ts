import { Effect, Layer } from 'effect';
import { FirestoreService } from 'effect-firebase';
import { getFirestore } from 'firebase/firestore';

export const layer = () =>
  Layer.succeed(FirestoreService, {
    get: (path: string) => {
      return Effect.succeed(getFirestore());
    },
  });
