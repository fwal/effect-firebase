import { describe, expect, it } from 'vitest';
import { Effect, ManagedRuntime, Layer, Schema } from 'effect';
import { Tool } from 'effect/unstable/ai';
import { GenkitError, genkit } from 'genkit';
import { makeTool } from './tool.js';

const runtime = () => ManagedRuntime.make(Layer.empty);

describe('makeTool', () => {
  it('registers a Genkit tool with JSON schemas derived from the Effect schemas', () => {
    const ai = genkit({});
    const GetWeather = Tool.make('getWeather', {
      description: 'Get current weather for a city',
      parameters: Schema.Struct({ city: Schema.String }),
      success: Schema.Struct({ tempC: Schema.Number }),
    });

    const tool = makeTool(
      ai,
      GetWeather,
      () => Effect.succeed({ tempC: 21 }),
      { runtime: runtime() }
    );

    expect(tool.__action.name).toBe('getWeather');
    expect(tool.__action.description).toBe('Get current weather for a city');
    expect(tool.__action.inputJsonSchema).toMatchObject({
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    });
    expect(tool.__action.outputJsonSchema).toMatchObject({
      type: 'object',
      required: ['tempC'],
    });
  });

  it('runs the Effect handler through the supplied runtime and returns its value', async () => {
    const ai = genkit({});
    const Echo = Tool.make('echo', {
      parameters: Schema.Struct({ message: Schema.String }),
      success: Schema.Struct({ message: Schema.String }),
    });

    const tool = makeTool(
      ai,
      Echo,
      ({ message }) => Effect.succeed({ message: message.toUpperCase() }),
      { runtime: runtime() }
    );

    const result = await tool({ message: 'hello' });
    expect(result).toEqual({ message: 'HELLO' });
  });

  it('encodes typed failures through failureSchema and throws as GenkitError', async () => {
    const ai = genkit({});
    const Lookup = Tool.make('lookup', {
      parameters: Schema.Struct({ id: Schema.String }),
      success: Schema.Struct({ value: Schema.String }),
      failure: Schema.Struct({
        reason: Schema.Literal('not_found'),
        id: Schema.String,
      }),
    });

    const tool = makeTool(
      ai,
      Lookup,
      ({ id }) => Effect.fail({ reason: 'not_found' as const, id }),
      { runtime: runtime() }
    );

    await expect(tool({ id: 'missing' })).rejects.toMatchObject({
      name: 'GenkitError',
      status: 'FAILED_PRECONDITION',
      detail: { reason: 'not_found', id: 'missing' },
    });
  });

  it('reports defects as INTERNAL GenkitError', async () => {
    const ai = genkit({});
    const Broken = Tool.make('broken', {
      parameters: Schema.Struct({ x: Schema.Number }),
      success: Schema.Struct({ y: Schema.Number }),
    });

    const tool = makeTool(
      ai,
      Broken,
      () => Effect.die(new Error('boom')),
      { runtime: runtime() }
    );

    const rejection = await tool({ x: 1 }).catch((e: unknown) => e);
    expect(rejection).toBeInstanceOf(GenkitError);
    expect((rejection as GenkitError).status).toBe('INTERNAL');
  });
});
