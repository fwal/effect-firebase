import { Schema, Effect, ParseResult } from 'effect';
import { FirestoreService } from '../firestore-service.js';

export const Date = Schema.transformOrFail(
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

export const ServerDate = Schema.transformOrFail(
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
    encode: () =>
      Effect.gen(function* () {
        const firestoreService = yield* FirestoreService;
        return yield* firestoreService.serverTimestamp();
      }),
    strict: true,
  }
);
