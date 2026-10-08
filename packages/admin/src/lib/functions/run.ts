import { Effect, Exit, ManagedRuntime } from 'effect';
import { logger } from 'firebase-functions';

export type Runtime<R> =
  | ManagedRuntime.ManagedRuntime<R, never>
  | (() => ManagedRuntime.ManagedRuntime<R, never>);

/**
 * Dispose a factory-form runtime, logging (never throwing) on failure.
 *
 * `ManagedRuntime.dispose()` rejects when any layer-level
 * `Effect.acquireRelease` finalizer fails. Letting that rejection propagate
 * from a `finally` block would override the effect's already-computed
 * result/`Exit` — masking a successful handler as a failure — so the disposal
 * error is observed via the logger instead of rethrown. The logged error has
 * a `stack` when the disposal defect is an `Error`.
 */
const disposeSafely = <R>(
  runner: ManagedRuntime.ManagedRuntime<R, never>,
): Promise<void> =>
  runner.dispose().catch((disposeError: unknown) => {
    logger.error('ManagedRuntime.dispose failed', {
      error: disposeError,
      stack: disposeError instanceof Error ? disposeError.stack : undefined,
    });
  });

/**
 * Run an effect with a runtime.
 *
 * A factory-form `runtime` (a `() => ManagedRuntime`) is built per call and
 * disposed once the effect completes, so layer-level `Effect.acquireRelease`
 * finalizers run. An instance-form `ManagedRuntime` is **not** disposed
 * here; its owner is responsible for its lifecycle (e.g. via
 * `FunctionsRuntime.make`'s signal handler or an explicit `dispose()`).
 *
 * A disposal failure never overrides the effect's outcome: the effect's
 * value is returned on success and its own error is rethrown on failure; the
 * disposal error is logged separately via `firebase-functions/logger`.
 *
 * @param runtime - The runtime to run the effect on, or a factory that builds one per call.
 * @param effect - The effect to run.
 * @returns The result of the effect.
 */
export async function run<A, R>(
  runtime: Runtime<R>,
  effect: Effect.Effect<A, never, R>,
): Promise<A> {
  if (typeof runtime === 'function') {
    const runner = runtime();
    try {
      return await runner.runPromise(effect);
    } finally {
      await disposeSafely(runner);
    }
  }
  return await runtime.runPromise(effect);
}

/**
 * Run an effect with a runtime and return its exit, so callers can
 * distinguish expected failures (e.g. an HttpsError raised to signal an
 * invalid request) from defects.
 *
 * Disposal semantics mirror {@link run}: a factory-form runtime is disposed
 * once the effect completes (success or failure); an instance-form runtime
 * is left for its owner to dispose. A disposal failure never overrides the
 * effect's `Exit` — a successful effect stays an `Exit.Success` and a failed
 * one stays its `Exit.Failure` — and is logged separately via
 * `firebase-functions/logger`.
 *
 * @param runtime - The runtime to run the effect on, or a factory that builds one per call.
 * @param effect - The effect to run.
 * @returns The exit of the effect.
 */
export async function runExit<A, E, R>(
  runtime: Runtime<R>,
  effect: Effect.Effect<A, E, R>,
): Promise<Exit.Exit<A, E>> {
  if (typeof runtime === 'function') {
    const runner = runtime();
    try {
      return await runner.runPromiseExit(effect);
    } finally {
      await disposeSafely(runner);
    }
  }
  return await runtime.runPromiseExit(effect);
}
