import { Schema } from 'effect';

/**
 * Class representing a GeoPoint in Firestore.
 */
/** Type-level brand so `GeoPoint` is matched nominally, not by field shape. */
export const GeoPointTypeId: unique symbol = Symbol.for(
  'effect-firebase/GeoPoint',
);
export class GeoPoint extends Schema.Class<GeoPoint>('GeoPoint')({
  latitude: Schema.Number,
  longitude: Schema.Number,
}) {
  declare readonly [GeoPointTypeId]: typeof GeoPointTypeId;
}

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
