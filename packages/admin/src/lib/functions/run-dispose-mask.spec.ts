import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from '@effect/vitest';
import {
  Cause,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Schema,
  Stream,
} from 'effect';
import { logger } from 'firebase-functions';
import { CallableRequest } from 'firebase-functions/https';
import { run, runExit } from './run.js';
import { onCallEffect } from './on-call.js';
import { onCallStreamEffect } from './on-call-stream.js';
import { onRequestEffect } from './on-request.js';
import { streamCallable } from './callable-testing.js';

/**
 * Reproduction + regression coverage for the dispose-masking bug in
 * `run`/`runExit`: a rejecting `ManagedRuntime.dispose()` in the factory-form
 * `finally` block must NOT override the effect's already-computed result.
 *
 * Invariant under test: a successful effect stays a success (and a failed
 * effect stays its own failure) regardless of whether layer-level
 * `Effect.acquireRelease` finalizers fail during disposal; the disposal error
 * is surfaced via the logger, never silently swallowed and never misdirected
 * to the client as `INTERNAL`.
 *
 * `Effect.acquireRelease` release actions are required to have an error
 * channel of `never`, so a failing finalizer must fail by defect (`Effect.die`).
 * Defects from real cleanup (a thrown `Error`, a failed `Promise`) surface the
 * same way, so the spec covers both a bare defect and an `Error` defect.
 */

const makeFailingFinalizerLayer = (
  finalizer: Effect.Effect<unknown, never, never>,
) => Layer.effectDiscard(Effect.acquireRelease(Effect.void, () => finalizer));

const FailingFinalizerLayer = {
  // A finalizer that defects on release with a bare defect value.
  die: () => makeFailingFinalizerLayer(Effect.die('cleanup-boom')),
  // A finalizer that defects on release with an `Error`, the shape a real
  // failed cleanup (a throw, a rejected `Promise`) produces.
  dieWithError: () =>
    makeFailingFinalizerLayer(Effect.die(new Error('cleanup-err'))),
};

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

describe('run() dispose masking', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('resolves with the effect value when a healthy finalizer disposes cleanly (control)', async () => {
    const counts = { acquire: 0, release: 0 };
    const layer = makeCountingLayer(counts);

    const result = await run(
      () => ManagedRuntime.make(layer),
      Effect.succeed('ok'),
    );

    expect(result).toBe('ok');
    expect(counts.release).toBe(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('resolves with the effect value when a finalizer defects on disposal', async () => {
    const result = await run(
      () => ManagedRuntime.make(FailingFinalizerLayer.die()),
      Effect.succeed('ok'),
    );

    expect(result).toBe('ok');
    expect(errorSpy).toHaveBeenCalledWith(
      'ManagedRuntime.dispose failed',
      expect.objectContaining({ error: 'cleanup-boom' }),
    );
  });

  it('logs the disposal error with its stack when the finalizer defect is an Error', async () => {
    const result = await run(
      () => ManagedRuntime.make(FailingFinalizerLayer.dieWithError()),
      Effect.succeed('ok'),
    );

    expect(result).toBe('ok');
    expect(errorSpy).toHaveBeenCalledWith(
      'ManagedRuntime.dispose failed',
      expect.objectContaining({
        error: expect.any(Error),
        stack: expect.any(String),
      }),
    );
  });

  it('still runs the finalizer when disposal fails, so cleanup is attempted', async () => {
    const counts = { acquire: 0, release: 0 };
    const layer = Layer.effectDiscard(
      Effect.acquireRelease(
        Effect.sync(() => {
          counts.acquire++;
        }),
        () =>
          Effect.sync(() => {
            counts.release++;
          }).pipe(Effect.andThen(Effect.die('cleanup-boom'))),
      ),
    );

    await run(() => ManagedRuntime.make(layer), Effect.succeed('ok'));

    expect(counts.acquire).toBe(1);
    expect(counts.release).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'ManagedRuntime.dispose failed',
      expect.objectContaining({ error: 'cleanup-boom' }),
    );
  });

  it('preserves the effect error over a disposal failure when the effect defects', async () => {
    const error = await run(
      () => ManagedRuntime.make(FailingFinalizerLayer.die()),
      Effect.die('effect-boom'),
    ).then(
      () => undefined,
      (e: unknown) => e,
    );

    // The effect's defect is rethrown, not the disposal's.
    expect(error).toBe('effect-boom');
    // The disposal error is observed via the logger, not thrown over the effect.
    expect(errorSpy).toHaveBeenCalledWith(
      'ManagedRuntime.dispose failed',
      expect.objectContaining({ error: 'cleanup-boom' }),
    );
  });

  it('rethrows the effect error unchanged when disposal succeeds', async () => {
    const error = await run(
      () => ManagedRuntime.make(makeCountingLayer({ acquire: 0, release: 0 })),
      Effect.die('effect-boom'),
    ).then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(error).toBe('effect-boom');
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('runExit() dispose masking', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('resolves to Exit.Success when a finalizer defects on disposal', async () => {
    const exit = await runExit(
      () => ManagedRuntime.make(FailingFinalizerLayer.die()),
      Effect.succeed('ok'),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toBe('ok');
    }
    expect(errorSpy).toHaveBeenCalledWith(
      'ManagedRuntime.dispose failed',
      expect.objectContaining({ error: 'cleanup-boom' }),
    );
  });

  it('never rejects on disposal failure: a factory-form runExit always settles to an Exit', async () => {
    // A rejecting dispose() must not turn the promise itself into a rejection;
    // callables depend on runExit resolving so they can inspect the Exit.
    const settle = await runExit(
      () => ManagedRuntime.make(FailingFinalizerLayer.die()),
      Effect.succeed('ok'),
    ).then(
      (exit) => ({ status: 'resolved' as const, exit }),
      (error: unknown) => ({ status: 'rejected' as const, error }),
    );

    expect(settle.status).toBe('resolved');
    if (settle.status === 'resolved') {
      expect(Exit.isSuccess(settle.exit)).toBe(true);
    }
  });

  it('preserves the effect Failure exit over a disposal failure (typed failure)', async () => {
    const exit = await runExit(
      () => ManagedRuntime.make(FailingFinalizerLayer.die()),
      Effect.fail('effect-fail'),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBe('effect-fail');
    }
    expect(errorSpy).toHaveBeenCalledWith(
      'ManagedRuntime.dispose failed',
      expect.objectContaining({ error: 'cleanup-boom' }),
    );
  });

  it('preserves the effect Failure exit over a disposal failure (defect)', async () => {
    const exit = await runExit(
      () => ManagedRuntime.make(FailingFinalizerLayer.die()),
      Effect.die('effect-die'),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBe('effect-die');
    }
    expect(errorSpy).toHaveBeenCalledWith(
      'ManagedRuntime.dispose failed',
      expect.objectContaining({ error: 'cleanup-boom' }),
    );
  });

  it('does not log a disposal error when dispose succeeds', async () => {
    const counts = { acquire: 0, release: 0 };
    await runExit(
      () => ManagedRuntime.make(makeCountingLayer(counts)),
      Effect.succeed('ok'),
    );

    expect(counts.release).toBe(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('exported wrappers with a failing factory-form finalizer', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe('onCallEffect', () => {
    it('returns the handler result to the client when disposal defects (was INTERNAL)', async () => {
      let handlerRan = false;
      const fn = onCallEffect(
        { runtime: () => ManagedRuntime.make(FailingFinalizerLayer.die()) },
        () =>
          Effect.sync(() => {
            handlerRan = true;
            return { ok: true };
          }),
      );

      const result = await fn.run({
        data: null,
        rawRequest: {},
        acceptsStreaming: false,
      } as CallableRequest);

      expect(handlerRan).toBe(true);
      expect(result).toEqual({ ok: true });
      expect(errorSpy).toHaveBeenCalledWith(
        'ManagedRuntime.dispose failed',
        expect.objectContaining({ error: 'cleanup-boom' }),
      );
      // The handler succeeded; no defect must be logged against the call.
      expect(errorSpy).not.toHaveBeenCalledWith(
        'Defect in onCall',
        expect.anything(),
      );
    });

    it('still surfaces the handler failure when the handler defects and disposal also defects', async () => {
      const fn = onCallEffect(
        { runtime: () => ManagedRuntime.make(FailingFinalizerLayer.die()) },
        () => Effect.die('handler-boom'),
      );

      const error = await fn
        .run({
          data: null,
          rawRequest: {},
          acceptsStreaming: false,
        } as CallableRequest)
        .then(
          () => undefined,
          (e: unknown) => e,
        );

      expect(error).toBe('handler-boom');
      expect(errorSpy).toHaveBeenCalledWith(
        'Defect in onCall',
        expect.anything(),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        'ManagedRuntime.dispose failed',
        expect.objectContaining({ error: 'cleanup-boom' }),
      );
    });
  });

  describe('onCallStreamEffect', () => {
    it('delivers all chunks and resolves data with them when disposal defects', async () => {
      const fn = onCallStreamEffect(
        { runtime: () => ManagedRuntime.make(FailingFinalizerLayer.die()) },
        () => Stream.make('a', 'b', 'c'),
      );

      const { stream, data } = streamCallable(fn, null);
      const chunks: unknown[] = [];
      for await (const chunk of stream) chunks.push(chunk);

      expect(chunks).toEqual(['a', 'b', 'c']);
      await expect(data).resolves.toEqual(['a', 'b', 'c']);
      expect(errorSpy).toHaveBeenCalledWith(
        'ManagedRuntime.dispose failed',
        expect.objectContaining({ error: 'cleanup-boom' }),
      );
      expect(errorSpy).not.toHaveBeenCalledWith(
        'Defect in onCallStream',
        expect.anything(),
      );
    });

    it('surfaces the stream failure and logs the disposal error separately when both the stream and disposal fail', async () => {
      const fn = onCallStreamEffect(
        { runtime: () => ManagedRuntime.make(FailingFinalizerLayer.die()) },
        () =>
          Stream.make('a', 'b', 'c').pipe(
            Stream.concat(Stream.die('stream-boom')),
          ),
      );

      const { stream, data } = streamCallable(fn, null);
      const chunks: unknown[] = [];
      for await (const chunk of stream) chunks.push(chunk);

      // Chunks emitted before the failure were still delivered.
      expect(chunks).toEqual(['a', 'b', 'c']);
      // The stream's own error reaches the client; disposal did not mask it.
      await expect(data).rejects.toBe('stream-boom');
      // The stream's failure is logged as a defect...
      expect(errorSpy).toHaveBeenCalledWith(
        'Defect in onCallStream',
        expect.objectContaining({ inner: 'stream-boom' }),
      );
      // ...and the disposal error is logged separately, not swallowed.
      expect(errorSpy).toHaveBeenCalledWith(
        'ManagedRuntime.dispose failed',
        expect.objectContaining({ error: 'cleanup-boom' }),
      );
    });
  });

  describe('onRequestEffect', () => {
    const makeResponse = () => {
      const statuses: number[] = [];
      const jsonBodies: unknown[] = [];
      const sends: number[] = [];
      const response = {
        status(code: number) {
          statuses.push(code);
          return this;
        },
        json(body: unknown) {
          jsonBodies.push(body);
          return this;
        },
        send() {
          sends.push(1);
          return this;
        },
      };
      return { response: response as never, statuses, jsonBodies, sends };
    };

    it('responds 200 with the body and does not send a spurious 500 when disposal defects', async () => {
      const { response, statuses, jsonBodies, sends } = makeResponse();
      const fn = onRequestEffect(
        {
          runtime: () => ManagedRuntime.make(FailingFinalizerLayer.die()),
          responseSchema: Schema.String,
        },
        () => Effect.succeed('ok'),
      );

      await fn({ body: {} } as never, response);

      // The success response is written inside the effect; only 200 is sent.
      expect(statuses).toEqual([200]);
      expect(jsonBodies).toEqual(['ok']);
      expect(sends).toEqual([]);
      expect(errorSpy).not.toHaveBeenCalledWith(
        'Defect in onRequest',
        expect.anything(),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        'ManagedRuntime.dispose failed',
        expect.objectContaining({ error: 'cleanup-boom' }),
      );
    });

    it('logs the handler defect and responds 500 when the effect defects (disposal also defects)', async () => {
      const { response, statuses, sends } = makeResponse();
      const fn = onRequestEffect(
        {
          runtime: () => ManagedRuntime.make(FailingFinalizerLayer.die()),
          responseSchema: Schema.String,
        },
        () => Effect.die('handler-boom'),
      );

      await fn({ body: {} } as never, response);

      expect(statuses).toContain(500);
      expect(sends.length).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        'Defect in onRequest',
        expect.anything(),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        'ManagedRuntime.dispose failed',
        expect.objectContaining({ error: 'cleanup-boom' }),
      );
    });
  });
});
