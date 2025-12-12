import { type FirestoreService } from 'effect-firebase';
import { layer as firestoreLayer } from './firestore/firestore-service.js';
import { cloudConsole } from './logger.js';
import { Layer } from 'effect';

export const layer: Layer.Layer<FirestoreService, never, never> = Layer.merge(
  firestoreLayer,
  cloudConsole
);
