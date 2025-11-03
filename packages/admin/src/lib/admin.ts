import { layer as firestoreLayer } from './firestore/firestore-service.js';
import { CloudLogger } from './logger.js';
import { Layer } from 'effect';

export const layer = Layer.merge(firestoreLayer, CloudLogger);
