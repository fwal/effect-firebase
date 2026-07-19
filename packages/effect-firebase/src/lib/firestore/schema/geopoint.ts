import { Schema } from 'effect';

/**
 * Class representing a GeoPoint in Firestore.
 */
export class GeoPoint extends Schema.Class<GeoPoint>('GeoPoint')({
  latitude: Schema.Number,
  longitude: Schema.Number,
}) {}

/**
 * Schema where GeoPoint class instance is both Type and Encoded.
 * Using instanceOf ensures the class instance is preserved through Schema.encode.
 */
export const GeoPointInstance = Schema.instanceOf(GeoPoint, {
  jsonSchema: {
    type: 'object',
    required: ['latitude', 'longitude'],
    properties: {
      latitude: { type: 'number' },
      longitude: { type: 'number' },
    },
  },
});
