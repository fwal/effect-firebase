import { Effect, Layer } from 'effect';
import { Client } from '@effect-firebase/client';
import { getFirestore } from 'firebase/firestore';
import { BrowserRuntime } from '@effect/platform-browser';

export const runMain = (program: Effect.Effect<void>) => {
  const mainLayer = Layer.mergeAll(Client.layer({ firestore: getFirestore() }));
  return BrowserRuntime.runMain(program.pipe(Effect.provide(mainLayer)));
};
