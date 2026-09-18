import { Data, Schema } from 'effect';

/**
 * The setup phase in which a function wrapper failed before (or after)
 * the user handler could run.
 */
export type FunctionSetupPhase =
  | 'decode-input'
  | 'encode-output'
  | 'decode-body'
  | 'encode-response'
  | 'decode-document'
  | 'decode-message'
  | 'decode-task';

/**
 * Error raised when a function wrapper fails during setup, before the user
 * handler runs (e.g. the provided data does not match the input schema) or
 * after it completes (e.g. the handler result does not match the output schema).
 *
 * All `*Effect` function wrappers accept an `onSetupError` option to recover
 * from this error instead of falling back to the wrapper's default behaviour.
 */
export class FunctionSetupError extends Data.TaggedError('FunctionSetupError')<{
  readonly phase: FunctionSetupPhase;
  /**
   * The underlying failure. Usually a `SchemaError`, but a plain `Error` when
   * the payload could not be read at all — a Pub/Sub message whose body is not
   * valid JSON, for example, which fails before any schema is applied.
   */
  readonly cause: Schema.SchemaError | Error;
}> {
  override get message(): string {
    return `Function setup failed during ${this.phase}: ${this.cause.message}`;
  }
}

/**
 * Check if a value is a FunctionSetupError.
 * @param value - The value to check.
 * @returns True if the value is a FunctionSetupError, false otherwise.
 */
export const isFunctionSetupError = (
  value: unknown,
): value is FunctionSetupError => value instanceof FunctionSetupError;
