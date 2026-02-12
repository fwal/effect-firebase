import type { FirebaseApp } from 'firebase/app';
import { Layer } from 'effect';
import { layer as firestoreLayer } from './firestore/firestore-service.js';
import { type FirestoreService } from 'effect-firebase';
import { App, layer as appLayer } from './app.js';

export const layer: Layer.Layer<FirestoreService, never, App> = firestoreLayer;

export const layerFromApp = (
  app: FirebaseApp
): Layer.Layer<FirestoreService, never, never> =>
  Layer.provide(layer, appLayer(app));
