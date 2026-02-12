import type { App as FirebaseAdminApp } from 'firebase-admin/app';
import { type FirestoreService } from 'effect-firebase';
import { layer as firestoreLayer } from './firestore/firestore-service.js';
import { cloudConsole } from './logger.js';
import { Layer } from 'effect';
import { App, layer as appLayer } from './app.js';

export const layer: Layer.Layer<FirestoreService, never, App> = Layer.merge(
  firestoreLayer,
  cloudConsole
);

export const layerFromApp = (
  app: FirebaseAdminApp
): Layer.Layer<FirestoreService, never, never> =>
  Layer.provide(layer, appLayer(app));
