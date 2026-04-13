import { Effect, Schema } from 'effect';
import { NoSuchElementError } from 'effect/Cause';

export interface ErrorResponse {
  error: {
    message: string;
    failures?: { path: string; message: string }[];
    tag: string;
  };
}

const formatError = (error: unknown): Effect.Effect<ErrorResponse> => {
  if (Schema.isSchemaError(error)) {
    return Effect.succeed({
      error: { message: error.message, tag: error._tag },
    });
  }
  if (error instanceof NoSuchElementError) {
    return Effect.succeed({
      error: { message: 'Item not found', tag: error._tag },
    });
  }
  return Effect.succeed({
    error: { message: 'Internal error', tag: 'UnknownError' },
  });
};

export const SerializeError = Effect.catch((error: unknown) =>
  formatError(error)
);

export const ErrorHandler = Effect.catchDefect((error) => formatError(error));
