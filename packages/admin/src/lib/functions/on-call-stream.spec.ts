import { Effect, ManagedRuntime, Layer, Schema, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { onCallStreamEffect } from './on-call-stream.js';
import { onCallEffect } from './on-call.js';
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

  it('fails when the input does not match the schema', async () => {
    const fn = onCallStreamEffect(
      { runtime, inputSchema: Schema.Struct({ count: Schema.Number }) },
      (input) => Stream.make(input.count),
    );

    await expect(
      streamCallable(fn, { count: 'nope' } as never).data,
    ).rejects.toThrow();
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
