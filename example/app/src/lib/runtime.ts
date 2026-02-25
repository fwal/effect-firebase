import type { FirebaseApp } from 'firebase/app';
import { Layer, ManagedRuntime } from 'effect';
import { Client } from '@effect-firebase/client';

export const makeRuntime = (app: FirebaseApp) => {
  const mainLayer = Layer.mergeAll(Client.layer({ app }));
  return ManagedRuntime.make(mainLayer);
};
