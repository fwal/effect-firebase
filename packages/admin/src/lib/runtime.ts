import type { Layer } from 'effect';
import type { FirestoreService } from 'effect-firebase';
import type { App as FirebaseAdminApp } from 'firebase-admin/app';

import { ManagedRuntime } from 'effect';
import { layerFromApp } from './admin.js';
import { logger } from 'firebase-functions';

/**
 * Creates a {@link https://effect.website/docs/runtime/#managedruntime | ManagedRuntime} from a given layer suitable for use in Firebase Functions.
 * The runtime will dispose itself when the instance shuts down.
 *
 * @param layer - The layer to create the ManagedRuntime from.
 * @returns The ManagedRuntime.
 *
 * @example
 * ```ts
 * import { FunctionsRuntime, Admin } from '@effect-firebase/admin';
 * import { initializeApp } from 'firebase-admin/app';
 *
 * const runtime = FunctionsRuntime.make(Admin.layerFromApp(initializeApp()));
 * ```
 */
export function make<R, E>(
  layer: Layer.Layer<R, E>
): ManagedRuntime.ManagedRuntime<R, E> {
  const runtime = ManagedRuntime.make(layer);

  // Create a listener that will dispose the runtime when the instance shuts down.
  const signalHandler: NodeJS.SignalsListener = async (signal) => {
    logger.debug(`${signal} received, disposing runtime`);
    await runtime.dispose();
    logger.debug(`Runtime disposed`);
  };

  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);

  return runtime;
}

/**
 * A default runtime for Firebase Functions.

 * @example
 * ```ts
 * import { FunctionsRuntime } from '@effect-firebase/admin';
 * import { initializeApp } from 'firebase-admin/app';
 *
 * const runtime = FunctionsRuntime.Default(initializeApp());
 * ```
 */
export function Default(
  app: FirebaseAdminApp
): ManagedRuntime.ManagedRuntime<FirestoreService, never> {
  return make(layerFromApp(app));
}
