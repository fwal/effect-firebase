import type {
  CallableFunction,
  CallableRequest,
  CallableResponse,
} from 'firebase-functions/https';

/**
 * Build a `CallableRequest` for unit tests. Only `data` is required; the
 * remaining fields default to an unauthenticated, streaming-capable request.
 */
export const makeCallableRequest = <T>(
  data: T,
  overrides: Partial<Omit<CallableRequest<T>, 'data'>> = {},
): CallableRequest<T> => ({
  data,
  acceptsStreaming: true,
  rawRequest: {} as CallableRequest['rawRequest'],
  ...overrides,
});

/**
 * Result of {@link streamCallable}. Mirrors the shape returned by the
 * Firebase client SDK's `httpsCallable(...).stream()`.
 */
export interface StreamCallableResult<Chunk, Data> {
  /** Chunks sent with `response.sendChunk`, in order. Ends when the handler completes. */
  readonly stream: AsyncIterable<Chunk>;
  /** The handler's return value (the callable's final `data`). */
  readonly data: Promise<Data>;
  /** Simulate a client disconnect by aborting `response.signal`. */
  readonly abort: () => void;
}

/**
 * Invoke a callable created with `onCallEffect` / `onCallStreamEffect` in a
 * unit test, providing a fake `CallableResponse` so that streaming code paths
 * run. Chunks passed to `response.sendChunk` are surfaced as an async
 * iterable, and the handler's return value as `data`.
 *
 * This is a stand-in for `CallableFunction.stream()`, which firebase-functions
 * does not implement yet.
 *
 * @example
 * ```ts
 * const { stream, data } = streamCallable(chat, { prompt: 'hi' });
 * const chunks: unknown[] = [];
 * for await (const chunk of stream) chunks.push(chunk);
 * expect(await data).toEqual(chunks);
 * ```
 */
export const streamCallable = <T, Return, Chunk = unknown>(
  fn: CallableFunction<T, Promise<Return>, Chunk>,
  request: T | CallableRequest<T>,
): StreamCallableResult<Chunk, Return> => {
  const fullRequest = isCallableRequest<T>(request)
    ? request
    : makeCallableRequest(request);

  const controller = new AbortController();
  const queue: Chunk[] = [];
  let waiting: (() => void) | undefined;
  let done = false;

  const wake = () => {
    waiting?.();
    waiting = undefined;
  };

  const response: CallableResponse<Chunk> = {
    sendChunk: async (chunk) => {
      if (!fullRequest.acceptsStreaming) return false;
      queue.push(chunk);
      wake();
      return true;
    },
    signal: controller.signal,
  };

  // `run` forwards every argument to the handler even though its type only
  // declares the request.
  const run = fn.run as unknown as (
    request: CallableRequest<T>,
    response: CallableResponse<Chunk>,
  ) => Promise<Return>;

  const data = run(fullRequest, response).finally(() => {
    done = true;
    wake();
  });
  // Avoid an unhandled rejection when the consumer only reads `stream`.
  data.catch(() => undefined);

  const stream: AsyncIterable<Chunk> = {
    [Symbol.asyncIterator]: () => ({
      next: async (): Promise<IteratorResult<Chunk>> => {
        while (queue.length === 0 && !done) {
          await new Promise<void>((resolve) => {
            waiting = resolve;
          });
        }
        if (queue.length > 0) {
          return { value: queue.shift() as Chunk, done: false };
        }
        return { value: undefined, done: true };
      },
    }),
  };

  return { stream, data, abort: () => controller.abort() };
};

/**
 * Invoke a callable in a unit test without streaming (like
 * `httpsCallable(...)(data)`), returning only the final `data`.
 */
export const runCallable = <T, Return, Chunk = unknown>(
  fn: CallableFunction<T, Promise<Return>, Chunk>,
  request: T | CallableRequest<T>,
): Promise<Return> => {
  const fullRequest = isCallableRequest<T>(request)
    ? request
    : makeCallableRequest(request, { acceptsStreaming: false });
  return fn.run({ ...fullRequest, acceptsStreaming: false });
};

const isCallableRequest = <T>(value: unknown): value is CallableRequest<T> =>
  typeof value === 'object' &&
  value !== null &&
  'data' in value &&
  'rawRequest' in value &&
  'acceptsStreaming' in value;
