import { Schema, Effect, ParseResult } from 'effect';
import { FirestoreService } from '../firestore-service.js';
import { ParseOptions, Transformation } from 'effect/SchemaAST';

const timestampDecoder = (
  data: unknown,
  _: ParseOptions,
  ast: Transformation
) =>
  Effect.gen(function* () {
    const firestoreService = yield* FirestoreService;
    return yield* firestoreService
      .convertFromTimestamp(data)
      .pipe(
        Effect.mapError(
          (error) => new ParseResult.Type(ast, data, error.toString())
        )
      );
  });

export const DateTime = Schema.transformOrFail(
  Schema.Unknown,
  Schema.DateTimeUtcFromSelf,
  {
    decode: timestampDecoder,
    encode: (date) =>
      Effect.gen(function* () {
        const firestoreService = yield* FirestoreService;
        return yield* firestoreService.convertToTimestamp(date);
      }),
    strict: true,
  }
);

export const ServerDateTime = Schema.transformOrFail(
  Schema.Unknown,
  Schema.DateTimeUtcFromSelf,
  {
    decode: timestampDecoder,
    encode: () =>
      Effect.gen(function* () {
        const firestoreService = yield* FirestoreService;
        return yield* firestoreService.serverTimestamp();
      }),
    strict: true,
  }
);
