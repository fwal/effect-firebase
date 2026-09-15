import { Effect, ManagedRuntime, Layer, Schema, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import type {
  CallableRequest,
  CallableResponse,
} from 'firebase-functions/https';
import { onCallStreamEffect } from './on-call-stream.js';
import { onCallEffect } from './on-call.js';

const runtime = ManagedRuntime.make(Layer.empty);

const makeRequest = <T>(data: T, acceptsStreaming = true): CallableRequest<T> =>
  ({
    data,
    acceptsStreaming,
    rawRequest: {} as CallableRequest['rawRequest'],
  }) as CallableRequest<T>;

const makeResponse = () => {
  const chunks: unknown[] = [];
  const controller = new AbortController();
  const response: CallableResponse = {
    sendChunk: async (chunk) => {
      chunks.push(chunk);
      return true;
    },
    signal: controller.signal,
  };
  return { chunks, controller, response };
};

// `run` only forwards the request in its type, but the underlying handler
// receives whatever arguments are passed. Use this to feed a response.
const invoke = <T, Return>(
  fn: { run: (request: CallableRequest<T>) => Return },
  request: CallableRequest<T>,
  response?: CallableResponse,
): Return =>
  (
    fn.run as unknown as (
      request: CallableRequest<T>,
      response?: CallableResponse,
    ) => Return
  )(request, response);

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

    const { chunks, response } = makeResponse();
    const result = await invoke(fn, makeRequest({ count: 3 }), response);

    expect(chunks).toEqual([{ index: 0 }, { index: 1 }, { index: 2 }]);
    expect(result).toEqual([{ index: 0 }, { index: 1 }, { index: 2 }]);
  });

  it('collects the full result when no response object is present', async () => {
    const fn = onCallStreamEffect({ runtime }, () =>
      Stream.make('a', 'b', 'c'),
    );

    const result = await invoke(fn, makeRequest(null, false));

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

    const { response } = makeResponse();
    await invoke(fn, makeRequest({}), response);

    expect(seen).toEqual({ acceptsStreaming: true, hasResponse: true });
  });

  it('halts the stream when the client disconnects', async () => {
    const { chunks, controller, response } = makeResponse();
    const fn = onCallStreamEffect({ runtime }, () =>
      Stream.range(0, 99).pipe(
        Stream.tap((index) =>
          index === 2 ? Effect.sync(() => controller.abort()) : Effect.void,
        ),
        // Yield so the abort listener fires before the next pull
        Stream.tap(() => Effect.sleep('1 millis')),
      ),
    );

    const result = await invoke(fn, makeRequest(null), response);

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.length).toBeLessThan(100);
    expect(result).toEqual(chunks);
  });

  it('fails when the input does not match the schema', async () => {
    const fn = onCallStreamEffect(
      { runtime, inputSchema: Schema.Struct({ count: Schema.Number }) },
      (input) => Stream.make(input.count),
    );

    await expect(
      invoke(fn, makeRequest({ count: 'nope' } as never)),
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

    const { chunks, response } = makeResponse();
    const result = await invoke(fn, makeRequest({ message: 'hi' }), response);

    expect(chunks).toEqual([{ echo: 'hi' }]);
    expect(result).toEqual({ done: true });
  });
});
