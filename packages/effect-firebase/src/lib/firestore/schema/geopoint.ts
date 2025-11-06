import { FirestoreService } from '../firestore-service.js';
import { Effect, ParseResult, Schema } from 'effect';

const BasicGeoPoint = Schema.Struct({
  latitude: Schema.Number,
  longitude: Schema.Number,
});

export const GeoPoint = Schema.transformOrFail(Schema.Unknown, BasicGeoPoint, {
  decode: (data, _, ast) =>
    Effect.gen(function* () {
      const firestoreService = yield* FirestoreService;
      return yield* firestoreService
        .convertFromGeoPoint(data)
        .pipe(
          Effect.mapError(
            (error) => new ParseResult.Type(ast, data, error.toString())
          )
        );
    }),
  encode: (geoPoint) =>
    Effect.gen(function* () {
      const firestoreService = yield* FirestoreService;
      return yield* firestoreService.convertToGeoPoint(
        geoPoint.latitude,
        geoPoint.longitude
      );
    }),
  strict: true,
});
