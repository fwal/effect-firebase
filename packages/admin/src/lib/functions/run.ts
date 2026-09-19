import { Effect, Exit, ManagedRuntime } from 'effect';

export type Runtime<R> =
  | ManagedRuntime.ManagedRuntime<R, never>
  | (() => ManagedRuntime.ManagedRuntime<R, never>);

/**
 * Run an effect with a runtime.
 *
 * A factory-form `runtime` (a `() => ManagedRuntime`) is built per call and
 * disposed once the effect completes, so layer-level `Effect.acquireRelease`
 * finalizers run. An instance-form `ManagedRuntime` is **not** disposed
 * here; its owner is responsible for its lifecycle (e.g. via
 * `FunctionsRuntime.make`'s signal handler or an explicit `dispose()`).
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
      await runner.dispose();
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
 * is left for its owner to dispose.
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
      await runner.dispose();
    }
  }
  return await runtime.runPromiseExit(effect);
}

/**
 * Check if a value is a runtime.
 * @param value - The value to check.
 * @returns True if the value is a runtime, false otherwise.
 */
export function isRuntime<R>(
  value: unknown,
): value is ManagedRuntime.ManagedRuntime<R, never> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'runPromise' in value &&
    'dispose' in value
  );
}
