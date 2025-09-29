import { Schema, Effect, ParseResult } from 'effect';
import { FirestoreService } from '../firestore/firestore-service.js';

export const DateFromFirestore = Schema.transformOrFail(
  Schema.Unknown,
  Schema.DateFromSelf,
  {
    decode: (data, _, ast) =>
      Effect.gen(function* () {
        const firestoreService = yield* FirestoreService;
        return yield* firestoreService
          .convertFromTimestamp(data)
          .pipe(
            Effect.mapError(
              (error) => new ParseResult.Type(ast, data, error.toString())
            )
          );
      }),
    encode: (date) =>
      Effect.gen(function* () {
        const firestoreService = yield* FirestoreService;
        return yield* firestoreService.convertToTimestamp(date);
      }),
    strict: true,
  }
);

export const Date = DateFromFirestore;
