import { Effect, Exit, ManagedRuntime } from 'effect';

export type Runtime<R> =
  | ManagedRuntime.ManagedRuntime<R, never>
  | (() => ManagedRuntime.ManagedRuntime<R, never>);

/**
 * Run an effect with a runtime and dispose the runtime after the effect is complete.
 * @param runtime - The runtime to run the effect on.
 * @param effect - The effect to run.
 * @returns The result of the effect.
 */
export async function run<A, R>(
  runtime: Runtime<R>,
  effect: Effect.Effect<A, never, R>,
): Promise<A> {
  const runner = typeof runtime === 'function' ? runtime() : runtime;
  return await runner.runPromise(effect);
}

/**
 * Run an effect with a runtime and return its exit, so callers can
 * distinguish expected failures (e.g. an HttpsError raised to signal an
 * invalid request) from defects.
 * @param runtime - The runtime to run the effect on.
 * @param effect - The effect to run.
 * @returns The exit of the effect.
 */
export async function runExit<A, E, R>(
  runtime: Runtime<R>,
  effect: Effect.Effect<A, E, R>,
): Promise<Exit.Exit<A, E>> {
  const runner = typeof runtime === 'function' ? runtime() : runtime;
  return await runner.runPromiseExit(effect);
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
