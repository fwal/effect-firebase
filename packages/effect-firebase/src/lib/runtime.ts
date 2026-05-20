import { Effect, ManagedRuntime } from 'effect';

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
  effect: Effect.Effect<A, never, R>
): Promise<A> {
  const runner = typeof runtime === 'function' ? runtime() : runtime;
  return await runner.runPromise(effect);
}

/**
 * Check if a value is a runtime.
 * @param value - The value to check.
 * @returns True if the value is a runtime, false otherwise.
 */
export function isRuntime<R>(
  value: unknown
): value is ManagedRuntime.ManagedRuntime<R, never> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'runPromise' in value &&
    'dispose' in value
  );
}
