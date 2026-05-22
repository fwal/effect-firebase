import { Cause, type Effect, Exit, Option, Schema } from 'effect';
import { Tool } from 'effect/unstable/ai';
import { isRuntime, type Runtime } from 'effect-firebase';
import { GenkitError, type Genkit, type ToolAction } from 'genkit';

interface MakeToolOptions<R> {
  runtime: Runtime<R>;
}

/**
 * Bridge an Effect `Tool` into a Genkit tool action.
 *
 * Converts the tool's Effect schemas to JSON Schema (`inputJsonSchema` /
 * `outputJsonSchema`) and runs the Effect handler through the supplied
 * managed runtime.
 *
 * Failure handling, in order:
 * 1. If the handler fails with (or dies with) a {@link GenkitError} or
 *    `UserFacingError`, that error is thrown as-is — preserving its status,
 *    detail, and source for Genkit's protocol mapping.
 * 2. Otherwise, if the tool declares a `failureSchema`, the typed failure
 *    is encoded through it and thrown as a fresh `GenkitError` with
 *    `status: 'FAILED_PRECONDITION'` and the encoded payload on `detail`.
 * 3. Otherwise, the original value is thrown directly (Error subclass) or
 *    wrapped in an `INTERNAL` `GenkitError`.
 *
 * @example
 * ```ts
 * import { Schema, Effect, Tool } from 'effect';
 * import { FunctionsRuntime } from '@effect-firebase/admin';
 * import { makeTool } from '@effect-firebase/genkit';
 *
 * const GetWeather = Tool.make('getWeather', {
 *   description: 'Get current weather for a city',
 *   parameters: Schema.Struct({ city: Schema.String }),
 *   success: Schema.Struct({ tempC: Schema.Number }),
 * });
 *
 * const tool = makeTool(ai, GetWeather,
 *   ({ city }) => Effect.succeed({ tempC: 21 }),
 *   { runtime: FunctionsRuntime.Default() }
 * );
 * ```
 */
export function makeTool<T extends Tool.Any, R, E>(
  ai: Genkit,
  tool: T,
  handler: (
    params: Tool.Parameters<T>
  ) => Effect.Effect<Tool.Success<T>, E, R>,
  options: MakeToolOptions<R>
): ToolAction {
  return ai.defineTool(
    {
      name: tool.name,
      description: tool.description ?? '',
      inputJsonSchema: Tool.getJsonSchema(tool),
      outputJsonSchema: Tool.getJsonSchemaFromSchema(tool.successSchema),
    },
    async (input) => {
      const runner = isRuntime<R>(options.runtime)
        ? options.runtime
        : options.runtime();
      const exit = await runner.runPromiseExit(
        handler(input as Tool.Parameters<T>)
      );
      if (Exit.isSuccess(exit)) {
        return exit.value as never;
      }
      throw await toGenkitError(runner, tool, exit.cause);
    }
  );
}

const toGenkitError = async <T extends Tool.Any, R>(
  runner: {
    readonly runPromiseExit: <A, E>(
      effect: Effect.Effect<A, E, R>
    ) => Promise<Exit.Exit<A, E>>;
  },
  tool: T,
  cause: Cause.Cause<unknown>
): Promise<unknown> => {
  const squashed = Cause.squash(cause);

  if (squashed instanceof GenkitError) {
    return squashed;
  }

  const failure = Cause.findErrorOption(cause);
  if (Option.isSome(failure)) {
    const encoded = await runner.runPromiseExit(
      Schema.encodeUnknownEffect(tool.failureSchema)(
        failure.value
      ) as Effect.Effect<unknown, unknown, R>
    );
    if (Exit.isSuccess(encoded)) {
      return new GenkitError({
        status: 'FAILED_PRECONDITION',
        message: `Tool '${tool.name}' failed`,
        detail: encoded.value,
      });
    }
  }

  if (squashed instanceof Error) {
    return squashed;
  }

  return new GenkitError({
    status: 'INTERNAL',
    message: `Tool '${tool.name}' failed`,
    detail: squashed,
  });
};
