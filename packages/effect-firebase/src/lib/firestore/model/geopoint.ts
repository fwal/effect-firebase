import { Model, VariantSchema } from 'effect/unstable/schema';
import * as FirestoreSchema from '../schema/schema.js';

/**
 * A field that stores a GeoPoint in Firestore and survives JSON serialization.
 *
 * - App (Type): `GeoPoint` class instance
 * - DB (Encoded): `GeoPoint` class instance (preserved through the driver)
 * - JSON (Encoded): plain `{ latitude, longitude }` object
 *
 * The DB variants keep the class instance intact so the Firestore driver can
 * map it to a native GeoPoint, while the JSON variants encode to a plain object
 * so the value can round-trip through `JSON.stringify`/`JSON.parse` like the
 * other model field types.
 *
 * @example
 * ```ts
 * import { Model } from 'effect-firebase';
 *
 * class PlaceModel extends Model.Class<PlaceModel>('PlaceModel')({
 *   id: Model.GeneratedByDb(PlaceId),
 *   location: Model.GeoPoint,
 * }) {}
 * ```
 */
export type GeoPoint = VariantSchema.Field<{
  select: typeof FirestoreSchema.GeoPointInstance;
  insert: typeof FirestoreSchema.GeoPointInstance;
  update: typeof FirestoreSchema.GeoPointInstance;
  json: typeof FirestoreSchema.GeoPoint;
  jsonCreate: typeof FirestoreSchema.GeoPoint;
  jsonUpdate: typeof FirestoreSchema.GeoPoint;
}>;

export const GeoPoint: GeoPoint = Model.Field({
  select: FirestoreSchema.GeoPointInstance,
  insert: FirestoreSchema.GeoPointInstance,
  update: FirestoreSchema.GeoPointInstance,
  json: FirestoreSchema.GeoPoint,
  jsonCreate: FirestoreSchema.GeoPoint,
  jsonUpdate: FirestoreSchema.GeoPoint,
});
