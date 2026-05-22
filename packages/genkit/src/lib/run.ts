import { Cause, type Effect, Exit } from 'effect';
import { isRuntime, type Runtime } from 'effect-firebase';

/**
 * Run an Effect on the supplied runtime and resolve with its value, or
 * throw the original error on failure.
 *
 * Unlike `runPromise`, which rejects with a `FiberFailure` wrapper, this
 * helper unwraps the cause via `Cause.squash` so framework code (Genkit,
 * Firebase Functions) sees the actual error instance — e.g. a
 * {@link import('genkit').GenkitError} or `UserFacingError` — and can map it
 * to its own protocol.
 */
export const runOrThrow = async <A, E, R>(
  runtime: Runtime<R>,
  effect: Effect.Effect<A, E, R>
): Promise<A> => {
  const runner = isRuntime<R>(runtime) ? runtime : runtime();
  const exit = await runner.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
};
