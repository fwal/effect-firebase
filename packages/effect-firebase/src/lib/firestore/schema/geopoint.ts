import { FirestoreService } from '../firestore-service.js';
import { Effect, ParseResult, Schema } from 'effect';

const GeoPoint = Schema.Struct({
  latitude: Schema.Number,
  longitude: Schema.Number,
});

export const GeoPointFromFirestore = Schema.transformOrFail(
  Schema.Unknown,
  GeoPoint,
  {
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
  }
);
