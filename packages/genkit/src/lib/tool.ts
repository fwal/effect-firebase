import { Cause, Effect, Exit, Option, Schema } from 'effect';
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
 * `outputJsonSchema`), runs the Effect handler through the supplied managed
 * runtime, and surfaces typed failures (`failureSchema`) as a {@link GenkitError}
 * whose `detail` carries the encoded failure value.
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
      const exit = await runner.runPromiseExit(handler(input as Tool.Parameters<T>));
      if (Exit.isSuccess(exit)) {
        return exit.value as never;
      }
      throw await toGenkitError(runner, tool, exit.cause);
    }
  );
}

const toGenkitError = async <T extends Tool.Any, R>(
  runner: { readonly runPromiseExit: <A, E>(effect: Effect.Effect<A, E, R>) => Promise<Exit.Exit<A, E>> },
  tool: T,
  cause: Cause.Cause<unknown>
): Promise<Error> => {
  const failure = Cause.findErrorOption(cause);
  if (Option.isNone(failure)) {
    return new GenkitError({
      status: 'INTERNAL',
      message: `Tool '${tool.name}' failed with a defect`,
      detail: Cause.squash(cause),
    });
  }
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
  return new GenkitError({
    status: 'FAILED_PRECONDITION',
    message: `Tool '${tool.name}' failed`,
    detail: failure.value,
  });
};
