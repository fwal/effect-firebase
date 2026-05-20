import { Effect, pipe, Schema } from 'effect';
import {
  onCallGenkit,
  type CallableFunction,
  type CallableOptions,
} from 'firebase-functions/https';
import { run, type Runtime } from 'effect-firebase';
import { logger } from 'firebase-functions';
import { z, type Genkit, type ToolArgument } from 'genkit';

interface CallGenkitEffectOptions<R> extends CallableOptions {
  name: string;
  runtime: Runtime<R>;
  description?: string;
  tools?: ToolArgument[];
  metadata?: Record<string, unknown>;
}

interface CallGenkitEffectOptionsWithInput<R, I extends Schema.Top>
  extends CallGenkitEffectOptions<R> {
  inputSchema: I;
}

interface CallGenkitEffectOptionsWithOutput<R, O extends Schema.Top>
  extends CallGenkitEffectOptions<R> {
  outputSchema: O;
}

interface CallGenkitEffectOptionsWithBoth<
  R,
  I extends Schema.Top,
  O extends Schema.Top
> extends CallGenkitEffectOptions<R> {
  inputSchema: I;
  outputSchema: O;
}

/**
 * Create a Firebase Functions callable trigger backed by a Genkit flow that
 * runs an Effect handler.
 *
 * Validation is performed by Effect's `Schema` (not Genkit's Zod), since
 * Genkit's `FlowConfig` does not accept JSON Schema. Tools registered via
 * `tools` are wired into Genkit's tool resolution so the handler can call
 * `ai.generate({ tools })` against them.
 *
 * @example
 * ```ts
 * import { Schema, Effect } from 'effect';
 * import { FunctionsRuntime } from '@effect-firebase/admin';
 * import { onCallGenkitEffect } from '@effect-firebase/genkit';
 *
 * export const summarize = onCallGenkitEffect(ai, {
 *   name: 'summarize',
 *   region: 'europe-north1',
 *   runtime: FunctionsRuntime.Default(),
 *   inputSchema: Schema.Struct({ text: Schema.String }),
 *   outputSchema: Schema.Struct({ summary: Schema.String }),
 * }, ({ text }) => Effect.gen(function* () {
 *   const { text: summary } = yield* Effect.promise(() =>
 *     ai.generate({ prompt: `Summarize: ${text}` })
 *   );
 *   return { summary };
 * }));
 * ```
 */
export function onCallGenkitEffect<
  R,
  I extends Schema.Top,
  O extends Schema.Top,
  E
>(
  ai: Genkit,
  options: CallGenkitEffectOptionsWithBoth<R, I, O>,
  handler: (
    input: Schema.Schema.Type<I>
  ) => Effect.Effect<Schema.Schema.Type<O>, E, R>
): CallableFunction<Schema.Codec.Encoded<I>, Promise<Schema.Codec.Encoded<O>>>;

export function onCallGenkitEffect<R, T, I extends Schema.Top, E>(
  ai: Genkit,
  options: CallGenkitEffectOptionsWithInput<R, I>,
  handler: (input: Schema.Schema.Type<I>) => Effect.Effect<T, E, R>
): CallableFunction<Schema.Codec.Encoded<I>, Promise<T>>;

export function onCallGenkitEffect<R, O extends Schema.Top, E>(
  ai: Genkit,
  options: CallGenkitEffectOptionsWithOutput<R, O>,
  handler: (input: unknown) => Effect.Effect<Schema.Schema.Type<O>, E, R>
): CallableFunction<unknown, Promise<Schema.Codec.Encoded<O>>>;

export function onCallGenkitEffect<R, T, E>(
  ai: Genkit,
  options: CallGenkitEffectOptions<R>,
  handler: (input: unknown) => Effect.Effect<T, E, R>
): CallableFunction<unknown, Promise<T>>;

export function onCallGenkitEffect<R>(
  ai: Genkit,
  options: CallGenkitEffectOptions<R> & {
    inputSchema?: Schema.Top;
    outputSchema?: Schema.Top;
  },
  handler: (input: unknown) => Effect.Effect<unknown, unknown, R>
): CallableFunction<unknown, Promise<unknown>> {
  const { inputSchema, outputSchema, name, description, tools, metadata } =
    options;

  const flow = ai.defineFlow(
    {
      name,
      inputSchema: z.any(),
      outputSchema: z.any(),
      ...(description !== undefined && { description }),
      ...(tools !== undefined && { tools }),
      ...(metadata !== undefined && { metadata }),
    },
    async (input) => {
      const effect = pipe(
        inputSchema
          ? Schema.decodeUnknownEffect(inputSchema)(input)
          : Effect.succeed(input),
        Effect.andThen((decoded) => handler(decoded)),
        Effect.andThen((output) =>
          outputSchema
            ? Schema.encodeUnknownEffect(outputSchema)(output)
            : Effect.succeed(output)
        )
      ).pipe(Effect.withSpan('onCallGenkitEffect'));

      return await run(
        options.runtime,
        effect as Effect.Effect<unknown, never, R>
      ).catch((error) => {
        logger.error('Defect in onCallGenkitEffect', {
          inner: error,
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      });
    }
  );

  return onCallGenkit(options, flow) as CallableFunction<
    unknown,
    Promise<unknown>
  >;
}
