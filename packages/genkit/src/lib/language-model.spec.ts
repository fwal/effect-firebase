import { describe, expect, it } from 'vitest';
import { Effect, Schema, Stream } from 'effect';
import { LanguageModel, Prompt, Tool, Toolkit } from 'effect/unstable/ai';
import { genkit, type GenerateResponseData } from 'genkit';
import {
  layer,
  toGenkitMessages,
  toGenkitToolChoice,
  toGenkitTools,
} from './language-model.js';

describe('toGenkitMessages', () => {
  it('maps roles and text parts (assistant -> model)', () => {
    const prompt = Prompt.make([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] },
    ]);

    expect(toGenkitMessages(prompt)).toEqual([
      { role: 'system', content: [{ text: 'You are helpful' }] },
      { role: 'user', content: [{ text: 'Hi' }] },
      { role: 'model', content: [{ text: 'Hello!' }] },
    ]);
  });

  it('maps tool-call and tool-result parts', () => {
    const prompt = Prompt.make([
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', id: 'c1', name: 'getWeather', params: { city: 'Paris' } },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            id: 'c1',
            name: 'getWeather',
            result: { tempC: 21 },
            isFailure: false,
          },
        ],
      },
    ]);

    expect(toGenkitMessages(prompt)).toEqual([
      {
        role: 'model',
        content: [
          { toolRequest: { ref: 'c1', name: 'getWeather', input: { city: 'Paris' } } },
        ],
      },
      {
        role: 'tool',
        content: [
          { toolResponse: { ref: 'c1', name: 'getWeather', output: { tempC: 21 } } },
        ],
      },
    ]);
  });
});

describe('toGenkitToolChoice', () => {
  it('omits auto (Genkit default) and passes through explicit choices', () => {
    expect(toGenkitToolChoice('auto')).toBeUndefined();
    expect(toGenkitToolChoice('none')).toBe('none');
    expect(toGenkitToolChoice('required')).toBe('required');
  });

  it('collapses object choices to required', () => {
    expect(toGenkitToolChoice({ tool: 'getWeather' })).toBe('required');
  });
});

describe('toGenkitTools', () => {
  it('builds Genkit dynamic tools with JSON schemas from Effect tools', () => {
    const ai = genkit({});
    const GetWeather = Tool.make('getWeather', {
      description: 'Get current weather for a city',
      parameters: Schema.Struct({ city: Schema.String }),
      success: Schema.Struct({ tempC: Schema.Number }),
    });

    const [tool] = toGenkitTools(ai, [GetWeather]);

    expect(tool.__action.name).toBe('getWeather');
    expect(tool.__action.description).toBe('Get current weather for a city');
    expect(tool.__action.inputJsonSchema).toMatchObject({
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    });
  });
});

describe('GenkitLanguageModel.generateText', () => {
  it('returns text, finish reason and usage from the Genkit model', async () => {
    const ai = genkit({});
    const model = ai.defineModel(
      { name: 'test/echo' },
      async (): Promise<GenerateResponseData> => ({
        message: { role: 'model', content: [{ text: 'Hello from stub' }] },
        finishReason: 'stop',
        usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
      })
    );

    const response = await Effect.runPromise(
      LanguageModel.generateText({ prompt: 'Hi' }).pipe(
        Effect.provide(layer(ai, { model }))
      )
    );

    expect(response.text).toBe('Hello from stub');
    expect(response.finishReason).toBe('stop');
    expect(response.usage.inputTokens.total).toBe(3);
    expect(response.usage.outputTokens.total).toBe(5);
  });

  it('surfaces tool calls returned by the model', async () => {
    const ai = genkit({});
    const GetWeather = Tool.make('getWeather', {
      description: 'Get current weather for a city',
      parameters: Schema.Struct({ city: Schema.String }),
      success: Schema.Struct({ tempC: Schema.Number }),
    });
    const weather = Toolkit.make(GetWeather);

    const model = ai.defineModel(
      { name: 'test/toolcaller', supports: { tools: true } },
      async (): Promise<GenerateResponseData> => ({
        message: {
          role: 'model',
          content: [
            {
              toolRequest: {
                ref: 'call_1',
                name: 'getWeather',
                input: { city: 'Paris' },
              },
            },
          ],
        },
        finishReason: 'stop',
      })
    );

    const response = await Effect.runPromise(
      LanguageModel.generateText({
        prompt: 'Weather in Paris?',
        toolkit: weather,
      }).pipe(
        Effect.provide(layer(ai, { model })),
        Effect.provide(
          weather.toLayer({
            getWeather: ({ city }) =>
              Effect.succeed({ tempC: city === 'Paris' ? 21 : 0 }),
          })
        )
      )
    );

    expect(response.toolCalls.map((call) => call.name)).toContain('getWeather');
    expect(response.finishReason).toBe('tool-calls');
  });
});

describe('GenkitLanguageModel.streamText', () => {
  it('streams text deltas followed by a finish part', async () => {
    const ai = genkit({});
    const model = ai.defineModel(
      { name: 'test/streamer' },
      async (_request, streamingCallback): Promise<GenerateResponseData> => {
        streamingCallback?.({ content: [{ text: 'Hello ' }] });
        streamingCallback?.({ content: [{ text: 'world' }] });
        return {
          message: { role: 'model', content: [{ text: 'Hello world' }] },
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        };
      }
    );

    const parts = await Effect.runPromise(
      LanguageModel.streamText({ prompt: 'Hi' }).pipe(
        Stream.runCollect,
        Effect.provide(layer(ai, { model }))
      )
    );

    const text = parts
      .filter((part) => part.type === 'text-delta')
      .map((part) => (part as { delta: string }).delta)
      .join('');

    expect(text).toBe('Hello world');
    expect(parts.some((part) => part.type === 'finish')).toBe(true);
  });
});
