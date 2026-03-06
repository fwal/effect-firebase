import { Effect, ParseResult } from 'effect';
import { NoSuchElementException } from 'effect/Cause';
import { ParseError } from 'effect/ParseResult';

export interface ErrorResponse {
  error: {
    message: string;
    failures?: { path: string; message: string }[];
    tag: string;
  };
}

const formatError = (error: unknown) => {
  if (error instanceof ParseError) {
    const failures = ParseResult.ArrayFormatter.formatErrorSync(error).map(
      (failure) => ({ path: failure.path.join('.'), message: failure.message })
    );
    return Effect.succeed({
      error: { message: 'Invalid input', failures, tag: error._tag },
    });
  }
  if (error instanceof NoSuchElementException) {
    return Effect.succeed({
      error: { message: 'Item not found', tag: error._tag },
    });
  }
  return Effect.succeed({
    error: { message: 'Internal error', tag: 'UnknownError' },
  });
};

export const SerializeError = Effect.catchAll<
  unknown,
  ErrorResponse,
  never,
  never
>((error) => formatError(error));

export const ErrorHandler = Effect.catchAllDefect((error) =>
  formatError(error)
);
