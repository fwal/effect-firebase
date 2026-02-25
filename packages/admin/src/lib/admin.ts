import {
  getApps,
  initializeApp,
  type App as FirebaseAdminApp,
} from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import { type FirestoreService } from 'effect-firebase';
import {
  layer as firestoreLayerLive,
  layerFromFirestore as firestoreLayerFromFirestore,
} from './firestore/firestore-service.js';
import { cloudConsole } from './logger.js';
import { Layer } from 'effect';
import { layer as appLayer } from './app.js';

/**
 * Configuration for {@link layer}.
 */
export interface LayerOptions {
  /**
   * Explicit Firebase Admin app instance to use.
   */
  readonly app?: FirebaseAdminApp;
  /**
   * Explicit Firestore instance to use.
   * When provided, the app option is ignored and Firestore is used directly.
   */
  readonly firestore?: Firestore;
}

type ReadyLayer = Layer.Layer<FirestoreService, never, never>;

const withCloudLogger = <R, E, RIn>(
  services: Layer.Layer<R, E, RIn>
): Layer.Layer<R, E, RIn> => Layer.merge(services, cloudConsole);

/**
 * Creates the default admin layer with Firestore service and cloud logging.
 *
 * Resolution order:
 * 1. `options.firestore`
 * 2. `options.app`
 * 3. existing default app (`getApps()[0]`)
 * 4. a newly initialized default app (`initializeApp()`)
 *
 * @throws If both `app` and `firestore` are provided.
 *
 * @example
 * ```ts
 * import { Admin } from '@effect-firebase/admin';
 *
 * const layer = Admin.layer();
 * ```
 *
 * @example
 * ```ts
 * import { initializeApp } from 'firebase-admin/app';
 * import { Admin } from '@effect-firebase/admin';
 *
 * const layer = Admin.layer({ app: initializeApp() });
 * ```
 *
 * @example
 * ```ts
 * import { initializeApp } from 'firebase-admin/app';
 * import { getFirestore } from 'firebase-admin/firestore';
 * import { Admin } from '@effect-firebase/admin';
 *
 * const app = initializeApp();
 * const layer = Admin.layer({ firestore: getFirestore(app) });
 * ```
 */
export function layer(
  options: LayerOptions & { app: FirebaseAdminApp }
): ReadyLayer;
export function layer(
  options: LayerOptions & { firestore: Firestore }
): ReadyLayer;
export function layer(options?: LayerOptions): ReadyLayer;
export function layer(options: LayerOptions = {}): ReadyLayer {
  if (options.app && options.firestore) {
    throw new Error(
      'Admin.layer: pass either { app } or { firestore }, not both.'
    );
  }

  if (options.firestore) {
    return withCloudLogger(firestoreLayerFromFirestore(options.firestore));
  }

  const baseLayer = withCloudLogger(firestoreLayerLive);
  const app = options.app || getApps()[0] || initializeApp();
  return Layer.provide(baseLayer, appLayer(app));
}
