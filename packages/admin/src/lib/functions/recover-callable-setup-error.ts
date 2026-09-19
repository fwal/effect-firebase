import { Effect } from 'effect';
import { HttpsError } from 'firebase-functions/https';
import { FunctionSetupError } from './setup-error.js';

/**
 * @internal Not part of the package's public API.
 *
 * Default recovery for a callable setup error: reject the call with an
 * `HttpsError` whose code and message reflect the setup phase that failed.
 *
 * Shared by the callable wrappers (`onCallEffect`, `onCallStreamEffect`),
 * which both reject instead of dying: an input decode failure becomes an
 * `invalid-argument` rejection carrying the schema error message, and any
 * other setup failure (notably output or chunk encoding) becomes an `internal`
 * rejection with a stable `'Failed to encode function output'` message.
 */
export const defaultSetupErrorResponse = (
  error: FunctionSetupError,
): Effect.Effect<never, HttpsError> =>
  Effect.fail(
    error.phase === 'decode-input'
      ? new HttpsError('invalid-argument', error.cause.message)
      : new HttpsError('internal', 'Failed to encode function output'),
  );
