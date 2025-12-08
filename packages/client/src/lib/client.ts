import { Layer } from "effect";
import { layer as firestoreLayer } from './firestore/firestore-service.js';
import { type FirestoreService } from "effect-firebase";

export const layer: Layer.Layer<FirestoreService, never, never> = firestoreLayer;
