import { getApp, type FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import { Layer } from 'effect';
import {
  layer as firestoreLayerLive,
  layerFromFirestore as firestoreLayerFromFirestore,
} from './firestore/firestore-service.js';
import { type FirestoreService } from 'effect-firebase';
import { layer as appLayer } from './app.js';

export interface LayerOptions {
  /**
   * Explicit Firebase app instance to use.
   */
  readonly app?: FirebaseApp;
  /**
   * Explicit Firestore instance to use.
   * When provided, the app option is ignored.
   */
  readonly firestore?: Firestore;
}

type ReadyLayer = Layer.Layer<FirestoreService, never, never>;

const resolveApp = (app?: FirebaseApp): FirebaseApp => {
  if (app) {
    return app;
  }

  try {
    return getApp();
  } catch (error) {
    throw new Error(
      'Client.layer: no Firebase app available. Pass { app } or initialize a default app before calling Client.layer().',
      { cause: error }
    );
  }
};

/**
 * Creates the default client layer with Firestore service.
 *
 * Resolution order:
 * 1. `options.firestore`
 * 2. `options.app`
 * 3. default app (`getApp()`)
 *
 * @throws If both `app` and `firestore` are provided.
 * @throws If no app is available and no `firestore` is provided.
 *
 * @example
 * ```ts
 * import { Client } from '@effect-firebase/client';
 *
 * const layer = Client.layer();
 * ```
 *
 * @example
 * ```ts
 * import { initializeApp } from 'firebase/app';
 * import { Client } from '@effect-firebase/client';
 *
 * const layer = Client.layer({ app: initializeApp({ projectId: 'my-project' }) });
 * ```
 */
export function layer(options: LayerOptions & { app: FirebaseApp }): ReadyLayer;
export function layer(
  options: LayerOptions & { firestore: Firestore }
): ReadyLayer;
export function layer(options?: LayerOptions): ReadyLayer;
export function layer(options: LayerOptions = {}): ReadyLayer {
  if (options.app && options.firestore) {
    throw new Error(
      'Client.layer: pass either { app } or { firestore }, not both.'
    );
  }

  if (options.firestore) {
    return firestoreLayerFromFirestore(options.firestore);
  }

  return Layer.provide(firestoreLayerLive, appLayer(resolveApp(options.app)));
}
