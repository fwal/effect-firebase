import { Effect, ManagedRuntime } from 'effect';

export async function run<A>(
  runtime: ManagedRuntime.ManagedRuntime<never, never>,
  effect: Effect.Effect<A, unknown>
) {
  const result = await runtime.runPromise(effect);
  await runtime.dispose();
  return result;
}
