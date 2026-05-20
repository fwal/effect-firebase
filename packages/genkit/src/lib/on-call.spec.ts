import { describe, expect, it } from 'vitest';
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { genkit } from 'genkit';
import { onCallGenkitEffect } from './on-call.js';

const runtime = () => ManagedRuntime.make(Layer.empty);

const findFlow = (ai: ReturnType<typeof genkit>, name: string) => {
  const flow = ai.flows.find((f) => f.__action.name === name);
  if (!flow) throw new Error(`Flow '${name}' was not registered`);
  return flow;
};

describe('onCallGenkitEffect', () => {
  it('registers a flow on the Genkit instance', () => {
    const ai = genkit({});
    onCallGenkitEffect(
      ai,
      {
        name: 'echo',
        runtime: runtime(),
        inputSchema: Schema.Struct({ text: Schema.String }),
        outputSchema: Schema.Struct({ echoed: Schema.String }),
      },
      ({ text }) => Effect.succeed({ echoed: text })
    );

    expect(ai.flows.some((f) => f.__action.name === 'echo')).toBe(true);
  });

  it('decodes input, runs the handler, and encodes output', async () => {
    const ai = genkit({});
    onCallGenkitEffect(
      ai,
      {
        name: 'upper',
        runtime: runtime(),
        inputSchema: Schema.Struct({ text: Schema.String }),
        outputSchema: Schema.Struct({ text: Schema.String }),
      },
      ({ text }) => Effect.succeed({ text: text.toUpperCase() })
    );

    const result = await findFlow(ai, 'upper')({ text: 'hello' });
    expect(result).toEqual({ text: 'HELLO' });
  });

  it('rejects with a SchemaError when input does not decode', async () => {
    const ai = genkit({});
    onCallGenkitEffect(
      ai,
      {
        name: 'strict',
        runtime: runtime(),
        inputSchema: Schema.Struct({ n: Schema.Number }),
        outputSchema: Schema.Struct({ n: Schema.Number }),
      },
      ({ n }) => Effect.succeed({ n: n + 1 })
    );

    await expect(
      findFlow(ai, 'strict')({ n: 'not-a-number' })
    ).rejects.toThrow();
  });

  it('accepts a handler with no schemas (raw input pass-through)', async () => {
    const ai = genkit({});
    onCallGenkitEffect(
      ai,
      { name: 'raw', runtime: runtime() },
      (input) => Effect.succeed({ received: input })
    );

    const result = await findFlow(ai, 'raw')({ anything: true });
    expect(result).toEqual({ received: { anything: true } });
  });
});
