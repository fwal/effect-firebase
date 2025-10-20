import { layer as firestoreLayer } from './firestore/firestore-service.js';
import { CloudLogger } from './runtime.js';
import { Layer } from 'effect';

export const layer = Layer.mergeAll(firestoreLayer, CloudLogger);
