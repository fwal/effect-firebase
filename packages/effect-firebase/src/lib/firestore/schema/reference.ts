import { FirestoreService } from '../firestore-service.js';
import { Effect, ParseResult, Schema } from 'effect';

export const BasicReference = <T extends string>(brand: T) =>
  Schema.Struct({
    id: Schema.String.pipe(Schema.brand(brand)),
    path: Schema.String,
  });

export const Reference = <T extends string>(brand: T) =>
  Schema.transformOrFail(Schema.Unknown, BasicReference(brand), {
    decode: (reference, _, ast) =>
      Effect.gen(function* () {
        const firestoreService = yield* FirestoreService;
        return yield* firestoreService
          .convertFromReference(reference)
          .pipe(
            Effect.mapError(
              (error) => new ParseResult.Type(ast, reference, error.toString())
            )
          );
      }),
    encode: ({ path }) =>
      Effect.gen(function* () {
        const firestoreService = yield* FirestoreService;
        return yield* firestoreService.convertToReference(path);
      }),
    strict: true,
  });
