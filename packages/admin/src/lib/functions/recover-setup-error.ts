import { Effect } from 'effect';
import { FunctionSetupError } from './setup-error.js';

/**
 * @internal Not part of the package's public API.
 *
 * Apply a trigger's `onSetupError` option, or treat the setup error as a
 * defect when no recovery was supplied.
 *
 * Shared by the Firestore, Pub/Sub and Cloud Tasks wrappers, which all recover
 * the same way: the handler is skipped and the event is considered handled.
 */
export const recoverSetupError = <R, Event>(
  options: {
    onSetupError?: (
      error: FunctionSetupError,
      event: Event,
    ) => Effect.Effect<void, never, R>;
  },
  error: FunctionSetupError,
  event: Event,
): Effect.Effect<void, never, R> =>
  options.onSetupError ? options.onSetupError(error, event) : Effect.die(error);
