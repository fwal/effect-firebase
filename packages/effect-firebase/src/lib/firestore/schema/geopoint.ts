import { Schema, SchemaGetter } from 'effect';

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
  representation: { id: 'effect-firebase/GeoPoint', payload: null },
  toCodecJson: () =>
    Schema.link<GeoPoint>()(
      Schema.Struct({ latitude: Schema.Number, longitude: Schema.Number }),
      {
        decode: SchemaGetter.transform(
          ({ latitude, longitude }) => new GeoPoint({ latitude, longitude }),
        ),
        encode: SchemaGetter.transform((g: GeoPoint) => ({
          latitude: g.latitude,
          longitude: g.longitude,
        })),
      },
    ),
});
