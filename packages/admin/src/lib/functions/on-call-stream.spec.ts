import {
  Data,
  Effect,
  ErrorReporter,
  Layer,
  ManagedRuntime,
  Schema,
  Stream,
} from 'effect';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from '@effect/vitest';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/https';
import { onCallStreamEffect } from './on-call-stream.js';
import { onCallEffect } from './on-call.js';
import { FunctionSetupError } from './setup-error.js';
import {
  makeCallableRequest,
  runCallable,
  streamCallable,
} from './callable-testing.js';

const runtime = ManagedRuntime.make(Layer.empty);

const collect = async <A>(iterable: AsyncIterable<A>): Promise<A[]> => {
  const out: A[] = [];
  for await (const item of iterable) out.push(item);
  return out;
};

describe('onCallStreamEffect', () => {
  it('sends encoded chunks and returns them as the final result', async () => {
    const fn = onCallStreamEffect(
      {
        runtime,
        inputSchema: Schema.Struct({ count: Schema.Number }),
        chunkSchema: Schema.Struct({ index: Schema.Number }),
      },
      (input) =>
        Stream.range(0, input.count - 1).pipe(
          Stream.map((index) => ({ index })),
        ),
    );

    const { stream, data } = streamCallable(fn, { count: 3 });
    const chunks = await collect(stream);

    expect(chunks).toEqual([{ index: 0 }, { index: 1 }, { index: 2 }]);
    expect(await data).toEqual(chunks);
  });

  it('collects the full result when the client does not stream', async () => {
    const fn = onCallStreamEffect({ runtime }, () =>
      Stream.make('a', 'b', 'c'),
    );

    const result = await runCallable(fn, null);

    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('exposes streaming context to the handler', async () => {
    let seen: { acceptsStreaming: boolean; hasResponse: boolean } | undefined;
    const fn = onCallStreamEffect(
      { runtime, inputSchema: Schema.Struct({}) },
      (_input, context) => {
        seen = {
          acceptsStreaming: context.acceptsStreaming,
          hasResponse: context.response !== undefined,
        };
        return Stream.empty;
      },
    );

    await streamCallable(fn, {}).data;

    expect(seen).toEqual({ acceptsStreaming: true, hasResponse: true });
  });

  it('passes auth through a full CallableRequest', async () => {
    const fn = onCallStreamEffect(
      { runtime, inputSchema: Schema.Struct({}) },
      (_input, context) => Stream.make(context.auth?.uid),
    );

    const request = makeCallableRequest(
      {},
      { auth: { uid: 'user-1', token: {} as never } },
    );
    const result = await streamCallable(fn, request).data;

    expect(result).toEqual(['user-1']);
  });

  it('halts the stream when the client disconnects', async () => {
    const fn = onCallStreamEffect({ runtime }, () =>
      Stream.range(0, 99).pipe(Stream.tap(() => Effect.sleep('1 millis'))),
    );

    const { stream, data, abort } = streamCallable(fn, null);
    const received: number[] = [];
    for await (const chunk of stream) {
      received.push(chunk);
      if (chunk === 2) abort();
    }

    expect(received.length).toBeGreaterThanOrEqual(3);
    expect(received.length).toBeLessThan(100);
    expect(await data).toEqual(received);
  });

  it('interrupts an in-flight pull when the client disconnects', async () => {
    let interrupted = false;
    let markStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const fn = onCallStreamEffect({ runtime }, () =>
      Stream.make(1, 2).pipe(
        Stream.concat(
          Stream.fromEffect(
            Effect.sync(() => markStarted()).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  interrupted = true;
                }),
              ),
            ),
          ),
        ),
      ),
    );

    const { stream, data, abort } = streamCallable(fn, null);
    const received = collect(stream);
    // Wait until the stalled pull is in flight, then disconnect
    await started;
    abort();

    expect(await data).toEqual([1, 2]);
    expect(await received).toEqual([1, 2]);
    expect(interrupted).toBe(true);
  });

  it('fails when the input does not match the schema', async () => {
    let handlerRan = false;
    const fn = onCallStreamEffect(
      { runtime, inputSchema: Schema.Struct({ count: Schema.Number }) },
      (input) => {
        handlerRan = true;
        return Stream.make(input.count);
      },
    );

    const error = await streamCallable(fn, { count: 'nope' } as never)
      .data.then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpsError);
    expect((error as HttpsError).code).toBe('invalid-argument');
    expect((error as HttpsError).message).toContain('count');
    expect(handlerRan).toBe(false);
  });
});

describe('onCallStreamEffect setup-error recovery', () => {
  it('rejects with an invalid-argument HttpsError carrying the decode message', async () => {
    const fn = onCallStreamEffect(
      { runtime, inputSchema: Schema.Struct({ count: Schema.Number }) },
      (input) => Stream.make(input.count),
    );

    const error = await streamCallable(fn, { count: 'nope' } as never)
      .data.then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpsError);
    expect((error as HttpsError).code).toBe('invalid-argument');
    expect((error as HttpsError).message).toMatch(/Expected number/i);
    expect((error as HttpsError).message).toContain('count');
  });

  it('rejects with an internal HttpsError when a chunk fails chunkSchema', async () => {
    const fn = onCallStreamEffect(
      {
        runtime,
        inputSchema: Schema.Struct({ name: Schema.String }),
        chunkSchema: Schema.Struct({ name: Schema.NonEmptyString }),
      },
      (input) => Stream.succeed({ name: input.name }),
    );

    // '' passes inputSchema (String) but is rejected by NonEmptyString at the
    // encode boundary.
    const error = await streamCallable(fn, { name: '' } as never)
      .data.then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpsError);
    expect((error as HttpsError).code).toBe('internal');
    expect((error as HttpsError).message).toBe(
      'Failed to encode function output',
    );
  });

  it('fails the stream at the first unencodable chunk, keeping the chunks sent before it', async () => {
    const fn = onCallStreamEffect(
      {
        runtime,
        chunkSchema: Schema.Struct({ name: Schema.NonEmptyString }),
      },
      () => Stream.make({ name: 'ok' }, { name: '' }, { name: 'also-ok' }),
    );

    const { stream, data } = streamCallable(fn, null);
    const seen: unknown[] = [];
    for await (const chunk of stream) seen.push(chunk);

    expect(seen).toEqual([{ name: 'ok' }]);
    const error = await data.then(() => undefined).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpsError);
    expect((error as HttpsError).code).toBe('internal');
    expect((error as HttpsError).message).toBe(
      'Failed to encode function output',
    );
  });

  it('propagates an HttpsError raised by the handler verbatim', async () => {
    const fn = onCallStreamEffect(
      { runtime, inputSchema: Schema.Struct({}) },
      () => Stream.fail(new HttpsError('permission-denied', 'no access')),
    );

    const error = await streamCallable(fn, {})
      .data.then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpsError);
    expect((error as HttpsError).code).toBe('permission-denied');
    expect((error as HttpsError).message).toBe('no access');
  });

  it('does not route a FunctionSetupError raised by the handler through setup recovery', async () => {
    const fn = onCallStreamEffect(
      { runtime, inputSchema: Schema.Struct({}) },
      () =>
        Stream.fail(
          new FunctionSetupError({
            phase: 'decode-input',
            cause: new Error('raised by the handler, not the boundary'),
          }),
        ),
    );

    const error = await streamCallable(fn, {})
      .data.then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FunctionSetupError);
    expect((error as FunctionSetupError).phase).toBe('decode-input');
  });
});

class QuietError extends Data.TaggedError('QuietError')<{
  readonly reason: string;
}> {
  readonly [ErrorReporter.ignore] = true;
}

class LoudError extends Data.TaggedError('LoudError')<{
  readonly reason: string;
}> {}

describe('onCallStreamEffect defect logging', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('does not log a decode-input failure (now an HttpsError) as a defect', async () => {
    const fn = onCallStreamEffect(
      { runtime, inputSchema: Schema.Struct({ count: Schema.Number }) },
      (input) => Stream.make(input.count),
    );

    const error = await streamCallable(fn, { count: 'nope' } as never)
      .data.then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpsError);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not log an HttpsError raised by the handler as a defect', async () => {
    const fn = onCallStreamEffect(
      { runtime, inputSchema: Schema.Struct({}) },
      () => Stream.fail(new HttpsError('not-found', 'gone')),
    );

    const error = await streamCallable(fn, {})
      .data.then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpsError);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not log an error annotated with ErrorReporter.ignore', async () => {
    const fn = onCallStreamEffect(
      { runtime, inputSchema: Schema.Struct({}) },
      () => Stream.fail(new QuietError({ reason: 'expected' })),
    );

    const error = await streamCallable(fn, {})
      .data.then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(QuietError);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs an unannotated handler error as a defect, and rethrows it', async () => {
    const fn = onCallStreamEffect(
      { runtime, inputSchema: Schema.Struct({}) },
      () => Stream.fail(new LoudError({ reason: 'unexpected' })),
    );

    const error = await streamCallable(fn, {})
      .data.then(() => undefined)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LoudError);
    expect(errorSpy).toHaveBeenCalledWith(
      'Defect in onCallStream',
      expect.objectContaining({ inner: expect.any(LoudError) }),
    );
  });
});

describe('onCallEffect context', () => {
  it('passes response and acceptsStreaming in the context', async () => {
    const fn = onCallEffect(
      { runtime, inputSchema: Schema.Struct({ message: Schema.String }) },
      (input, context) =>
        Effect.gen(function* () {
          const response = context.response;
          if (context.acceptsStreaming && response) {
            yield* Effect.promise(() =>
              response.sendChunk({ echo: input.message }),
            );
          }
          return { done: true };
        }),
    );

    const { stream, data } = streamCallable(fn, { message: 'hi' });

    expect(await collect(stream)).toEqual([{ echo: 'hi' }]);
    expect(await data).toEqual({ done: true });
  });

  it('does not stream when the client does not accept streaming', async () => {
    let streamed = false;
    const fn = onCallEffect(
      { runtime, inputSchema: Schema.Struct({}) },
      (_input, context) =>
        Effect.sync(() => {
          streamed = context.acceptsStreaming;
          return 'ok';
        }),
    );

    expect(await runCallable(fn, {})).toBe('ok');
    expect(streamed).toBe(false);
  });
});
