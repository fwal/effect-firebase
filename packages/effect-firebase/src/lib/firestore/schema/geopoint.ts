import { Schema } from 'effect';

/**
 * Class representing a GeoPoint in Firestore.
 */
export class GeoPoint extends Schema.Class<GeoPoint>('GeoPoint')({
  latitude: Schema.Number,
  longitude: Schema.Number,
}) {}
