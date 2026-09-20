import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { CallableRequest } from 'firebase-functions/https';
import { onCallEffect } from './on-call.js';
import { onRequestEffect } from './on-request.js';
import { run, runExit } from './run.js';

const makeCountingLayer = (counts: { acquire: number; release: number }) =>
  Layer.effectDiscard(
    Effect.acquireRelease(
      Effect.sync(() => {
        counts.acquire++;
      }),
      () =>
        Effect.sync(() => {
          counts.release++;
        }),
    ),
  );

describe('run()', () => {
  it('disposes a factory-form runtime after a successful effect so layer-level finalizers run', async () => {
    const counts = { acquire: 0, release: 0 };
    const layer = makeCountingLayer(counts);

    const result = await run(
      () => ManagedRuntime.make(layer),
      Effect.succeed('ok'),
    );

    expect(result).toBe('ok');
    expect(counts.acquire).toBe(1);
    expect(counts.release).toBe(1);
  });

  it('disposes a factory-form runtime even when the effect defects', async () => {
    const counts = { acquire: 0, release: 0 };
    const layer = makeCountingLayer(counts);

    await expect(
      run(() => ManagedRuntime.make(layer), Effect.die('boom')),
    ).rejects.toThrow();

    expect(counts.release).toBe(1);
  });

  it('does NOT dispose an instance-form runtime; the owner disposes it', async () => {
    const counts = { acquire: 0, release: 0 };
    const layer = makeCountingLayer(counts);
    const runtime = ManagedRuntime.make(layer);

    await run(runtime, Effect.void);
    await run(runtime, Effect.void);

    expect(counts.acquire).toBe(1);
    expect(counts.release).toBe(0);

    await runtime.dispose();

    expect(counts.release).toBe(1);
  });
});

describe('runExit()', () => {
  it('disposes a factory-form runtime after a successful effect', async () => {
    const counts = { acquire: 0, release: 0 };
    const layer = makeCountingLayer(counts);

    await runExit(() => ManagedRuntime.make(layer), Effect.succeed('ok'));

    expect(counts.release).toBe(1);
  });

  it('disposes a factory-form runtime even when the effect fails with a Failure exit', async () => {
    const counts = { acquire: 0, release: 0 };
    const layer = makeCountingLayer(counts);

    await runExit(() => ManagedRuntime.make(layer), Effect.fail('nope'));

    expect(counts.release).toBe(1);
  });
});

describe('exported wrappers with a factory-form runtime', () => {
  it('onRequestEffect disposes the runtime after handling a request', async () => {
    const counts = { acquire: 0, release: 0 };
    const layer = makeCountingLayer(counts);
    const fn = onRequestEffect(
      {
        runtime: () => ManagedRuntime.make(layer),
        responseSchema: Schema.String,
      },
      () => Effect.succeed('ok'),
    );

    await fn(
      { body: {} } as never,
      {
        status() {
          return this;
        },
        json() {
          return this;
        },
        send() {
          return this;
        },
      } as never,
    );

    expect(counts.release).toBe(1);
  });

  it('onCallEffect disposes the runtime after handling a call', async () => {
    const counts = { acquire: 0, release: 0 };
    const layer = makeCountingLayer(counts);
    const fn = onCallEffect({ runtime: () => ManagedRuntime.make(layer) }, () =>
      Effect.succeed('ok'),
    );

    const result = await fn.run({
      data: 'anything',
      rawRequest: {},
      acceptsStreaming: false,
    } as CallableRequest);

    expect(result).toBe('ok');
    expect(counts.release).toBe(1);
  });
});
