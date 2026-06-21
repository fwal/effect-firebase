import { Effect, Layer, Stream } from 'effect';
import {
  AiError,
  IdGenerator,
  LanguageModel,
  Prompt,
  Response,
  Tool,
} from 'effect/unstable/ai';
import type {
  GenerateOptions,
  GenerateResponse,
  GenerateResponseChunk,
  GenerationUsage,
  MessageData,
  Part,
  ToolAction,
  ToolChoice as GenkitToolChoice,
} from 'genkit';
import type { Genkit } from 'genkit';

/**
 * Options for creating a Genkit-backed Effect {@link LanguageModel}.
 */
export interface GenkitLanguageModelOptions {
  /**
   * The Genkit model to generate with — a model reference or a fully
   * qualified name such as `'googleai/gemini-2.0-flash'`.
   */
  readonly model: NonNullable<GenerateOptions['model']>;
  /**
   * Provider-specific generation config (e.g. `temperature`, `maxOutputTokens`)
   * forwarded to every Genkit `generate` call. Effect's `ProviderOptions` does
   * not carry these per-call, so they are configured on the model instead.
   */
  readonly config?: Record<string, unknown> | undefined;
}

const MODULE = '@effect-firebase/genkit/GenkitLanguageModel';

/**
 * Wrap any thrown Genkit/runtime error as an Effect `AiError`.
 */
const toAiError = (method: string) => (error: unknown): AiError.AiError =>
  new AiError.AiError({
    module: MODULE,
    method,
    reason: new AiError.UnknownError({
      description:
        error instanceof Error ? error.message : `Unknown error: ${error}`,
    }),
  });

/**
 * Convert an Effect `Prompt` into Genkit conversation messages.
 *
 * Effect's `assistant` role maps to Genkit's `model` role; tool calls become
 * `toolRequest` parts and tool results become `toolResponse` parts.
 */
export const toGenkitMessages = (
  prompt: Prompt.Prompt
): MessageData[] =>
  prompt.content.map((message): MessageData => {
    switch (message.role) {
      case 'system':
        return { role: 'system', content: [{ text: message.content }] };
      case 'user':
        return { role: 'user', content: toGenkitParts(message.content) };
      case 'assistant':
        return { role: 'model', content: toGenkitParts(message.content) };
      case 'tool':
        return { role: 'tool', content: toGenkitParts(message.content) };
    }
  });

const toGenkitParts = (parts: ReadonlyArray<Prompt.Part>): Part[] => {
  const result: Part[] = [];
  for (const part of parts) {
    switch (part.type) {
      case 'text':
        result.push({ text: part.text });
        break;
      case 'tool-call':
        result.push({
          toolRequest: { ref: part.id, name: part.name, input: part.params },
        });
        break;
      case 'tool-result':
        result.push({
          toolResponse: { ref: part.id, name: part.name, output: part.result },
        });
        break;
      // Reasoning / file / approval parts are not forwarded in this iteration.
      default:
        break;
    }
  }
  return result;
};

/**
 * Convert Effect tools into Genkit dynamic tools so the model is told about
 * them. Handlers are intentionally omitted — the provider always requests
 * `returnToolRequests: true` so that Effect (not Genkit) drives tool execution.
 */
export const toGenkitTools = (
  ai: Genkit,
  tools: ReadonlyArray<Tool.Any>
): ToolAction[] =>
  tools.map((tool) =>
    ai.dynamicTool({
      name: tool.name,
      description: tool.description ?? '',
      inputJsonSchema: Tool.getJsonSchema(tool),
      outputJsonSchema: Tool.getJsonSchemaFromSchema(tool.successSchema),
    })
  );

/**
 * Map Effect's richer `ToolChoice` onto Genkit's `'auto' | 'required' | 'none'`.
 *
 * `'auto'` is Genkit's default, so it is left unset to avoid sending a
 * `toolChoice` to models that don't advertise support for the option. Object
 * choices (specific tool / subset) collapse to `'required'`.
 */
export const toGenkitToolChoice = (
  choice: LanguageModel.ToolChoice<string>
): GenkitToolChoice | undefined => {
  if (choice === 'auto') {
    return undefined;
  }
  if (choice === 'none' || choice === 'required') {
    return choice;
  }
  return 'required';
};

const mapFinishReason = (
  reason: GenerateResponse['finishReason']
): Response.FinishPartEncoded['reason'] => {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'blocked':
      return 'content-filter';
    case 'interrupted':
      return 'pause';
    case 'aborted':
      return 'error';
    default:
      return 'unknown';
  }
};

const mapUsage = (
  usage: GenerationUsage | undefined
): Response.FinishPartEncoded['usage'] => ({
  inputTokens: {
    uncached: undefined,
    total: usage?.inputTokens,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: usage?.outputTokens,
    text: undefined,
    reasoning: undefined,
  },
});

/**
 * Convert the content parts of a Genkit message into Effect response parts.
 * Tool calls without a `ref` are assigned a freshly generated id.
 */
const contentToParts = (
  content: ReadonlyArray<Part>,
  idGen: IdGenerator.Service
): Effect.Effect<Array<Response.PartEncoded>> =>
  Effect.gen(function* () {
    const parts: Array<Response.PartEncoded> = [];
    for (const part of content) {
      if (typeof part.text === 'string' && part.text.length > 0) {
        parts.push({ type: 'text', text: part.text });
      } else if (part.toolRequest) {
        const id = part.toolRequest.ref ?? (yield* idGen.generateId());
        parts.push({
          type: 'tool-call',
          id,
          name: part.toolRequest.name,
          params: part.toolRequest.input,
        });
      }
    }
    return parts;
  });

const finishPart = (response: GenerateResponse): Response.FinishPartEncoded => {
  const hasToolCalls = (response.message?.content ?? []).some(
    (part) => part.toolRequest != null
  );
  return {
    type: 'finish',
    reason: hasToolCalls ? 'tool-calls' : mapFinishReason(response.finishReason),
    usage: mapUsage(response.usage),
    response: undefined,
  };
};

/**
 * Build the Genkit `generate` request shared by `generateText` and
 * `streamText`. Tools are always sent with `returnToolRequests` so Effect
 * drives the tool loop.
 */
const buildRequest = (
  options: GenkitLanguageModelOptions,
  providerOptions: LanguageModel.ProviderOptions,
  tools: ToolAction[]
): GenerateOptions => {
  const toolChoice = toGenkitToolChoice(providerOptions.toolChoice);
  return {
    model: options.model,
    messages: toGenkitMessages(providerOptions.prompt),
    ...(toolChoice !== undefined && { toolChoice }),
    ...(options.config !== undefined && { config: options.config }),
    ...(tools.length > 0 && { tools, returnToolRequests: true }),
  };
};

/**
 * Creates a {@link LanguageModel} service backed by a Genkit instance.
 *
 * Every generation runs through `ai.generate` / `ai.generateStream`, so model
 * calls are traced by Genkit and observable in the Genkit Developer UI and
 * Firebase monitoring. Author your agent with Effect's AI API
 * (`LanguageModel`, `Chat`, `Toolkit`) and provide this layer.
 *
 * @example
 * ```ts
 * import { Effect } from 'effect';
 * import { LanguageModel } from 'effect/unstable/ai';
 * import { genkit } from 'genkit';
 * import { googleAI } from '@genkit-ai/googleai';
 * import { GenkitLanguageModel } from '@effect-firebase/genkit';
 *
 * const ai = genkit({ plugins: [googleAI()] });
 *
 * const program = LanguageModel.generateText({
 *   prompt: 'Why is the sky blue?',
 * }).pipe(
 *   Effect.provide(GenkitLanguageModel.layer(ai, { model: 'googleai/gemini-2.0-flash' }))
 * );
 * ```
 */
export const make = (
  ai: Genkit,
  options: GenkitLanguageModelOptions
): Effect.Effect<LanguageModel.Service> =>
  LanguageModel.make({
    generateText: (providerOptions) =>
      Effect.gen(function* () {
        const idGen = yield* IdGenerator.IdGenerator;
        const tools = toGenkitTools(ai, providerOptions.tools);
        const response = yield* Effect.tryPromise({
          try: () => ai.generate(buildRequest(options, providerOptions, tools)),
          catch: toAiError('generateText'),
        });
        const parts = yield* contentToParts(
          response.message?.content ?? [],
          idGen
        );
        return [...parts, finishPart(response)];
      }),

    streamText: (providerOptions) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const idGen = yield* IdGenerator.IdGenerator;
          const textId = yield* idGen.generateId();
          const tools = toGenkitTools(ai, providerOptions.tools);

          const { stream, response } = ai.generateStream(
            buildRequest(options, providerOptions, tools)
          );

          const body = Stream.fromAsyncIterable(
            stream,
            toAiError('streamText')
          ).pipe(
            Stream.flatMap((chunk: GenerateResponseChunk) =>
              Stream.fromIterable(chunkToStreamParts(chunk, textId))
            )
          );

          const finish = Stream.fromEffect(
            Effect.tryPromise({
              try: () => response,
              catch: toAiError('streamText'),
            })
          ).pipe(Stream.map(finishPart));

          const startPart: Response.StreamPartEncoded = {
            type: 'text-start',
            id: textId,
          };
          const endPart: Response.StreamPartEncoded = {
            type: 'text-end',
            id: textId,
          };

          return Stream.fromIterable<Response.StreamPartEncoded>([
            startPart,
          ]).pipe(
            Stream.concat(body),
            Stream.concat(Stream.fromIterable([endPart])),
            Stream.concat(finish)
          );
        })
      ),
  });

const chunkToStreamParts = (
  chunk: GenerateResponseChunk,
  textId: string
): Array<Response.StreamPartEncoded> => {
  const parts: Array<Response.StreamPartEncoded> = [];
  const text = chunk.text;
  if (typeof text === 'string' && text.length > 0) {
    parts.push({ type: 'text-delta', id: textId, delta: text });
  }
  for (const [index, request] of chunk.toolRequests.entries()) {
    parts.push({
      type: 'tool-call',
      id: request.toolRequest.ref ?? `${textId}-tool-${index}`,
      name: request.toolRequest.name,
      params: request.toolRequest.input,
    });
  }
  return parts;
};

/**
 * A `Layer` that provides a Genkit-backed {@link LanguageModel}.
 */
export const layer = (
  ai: Genkit,
  options: GenkitLanguageModelOptions
): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.effect(LanguageModel.LanguageModel, make(ai, options));
