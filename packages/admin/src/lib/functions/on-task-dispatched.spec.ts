import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest';
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { HttpsError } from 'firebase-functions/https';
import { Request } from 'firebase-functions/v2/tasks';
import { type Response } from 'express';
import { onTaskDispatchedEffect } from './on-task-dispatched.js';
import { FunctionSetupError } from './setup-error.js';

const runtime = ManagedRuntime.make(Layer.empty);

const Task = Schema.Struct({ amount: Schema.Number });

/**
 * `onTaskDispatchedEffect` returns a `TaskQueueFunction` whose top-level
 * callable is the SDK's `onDispatchHandler`-wrapped handler (NOT `fn.run`,
 * which exposes the raw inner handler and bypasses the HTTP boundary). The
 * retry contract is decided at that boundary: a resolved handler yields
 * HTTP `204` (Cloud Tasks deletes the task; no retry) while a rejected
 * handler yields a non-`2xx` status (retry-class) so `retryConfig` applies.
 *
 * Driving `func(req, res)` exercises the boundary. `FUNCTIONS_EMULATOR=1`
 * skips the SDK's bearer-token check inside `onDispatchHandler`, so the
 * fake request needs no `Authorization` header.
 */
const makeRequest = (data: unknown): Request => {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-cloudtasks-queuename': 'projects/p/locations/l/queues/q',
    'x-cloudtasks-taskname': 'projects/p/locations/l/queues/q/tasks/t',
  };
  return {
    method: 'POST',
    headers,
    header(name: string) {
      const lower = name.toLowerCase();
      const key = Object.keys(headers).find((k) => k.toLowerCase() === lower);
      return key ? headers[key] : undefined;
    },
    body: { data },
  } as unknown as Request;
};

interface SentResponse {
  status?: number;
  ended: boolean;
  sentBody?: unknown;
}

const makeResponse = (): { response: Response; sent: SentResponse } => {
  const sent: SentResponse = { ended: false };
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    end() {
      sent.ended = true;
      return this;
    },
    send(body: unknown) {
      sent.sentBody = body;
      sent.ended = true;
      return this;
    },
  } as unknown as Response;
  return { response, sent };
};

describe('onTaskDispatchedEffect', () => {
  // The SDK's onDispatchHandler skips its bearer-token validation branch when
  // FUNCTIONS_EMULATOR is set, so a fake request without an Authorization
  // header reaches the inner handler. Restore on exit to keep the env clean.
  const previous = process.env.FUNCTIONS_EMULATOR;
  beforeAll(() => {
    process.env.FUNCTIONS_EMULATOR = '1';
  });
  afterAll(() => {
    if (previous === undefined) {
      delete process.env.FUNCTIONS_EMULATOR;
    } else {
      process.env.FUNCTIONS_EMULATOR = previous;
    }
  });

  it('answers HTTP 204 when the handler succeeds (no spurious retry)', async () => {
    let handlerRan = false;
    const fn = onTaskDispatchedEffect({ runtime, schema: Task }, (data) =>
      Effect.sync(() => {
        handlerRan = true;
        expect(data).toEqual({ amount: 5 });
      }),
    );

    const { response, sent } = makeResponse();
    await fn(makeRequest({ amount: 5 }), response);

    expect(handlerRan).toBe(true);
    expect(sent.status).toBe(204);
    expect(sent.ended).toBe(true);
  });

  it('answers HTTP 500 on a handler failure so Cloud Tasks retries per retryConfig', async () => {
    const fn = onTaskDispatchedEffect(
      { runtime, schema: Task, retryConfig: { maxAttempts: 5 } },
      () => Effect.fail(new Error('downstream 503')),
    );

    const { response, sent } = makeResponse();
    await fn(makeRequest({ amount: 5 }), response);

    // A plain Error (not an HttpsError) is wrapped as `internal` -> 500, a
    // 5XX retry-class failure under the Cloud Tasks HTTP-target contract.
    expect(sent.status).toBe(500);
    expect(sent.ended).toBe(true);
  });

  it('forwards the handler HttpsError status so Cloud Tasks honours the chosen signal', async () => {
    const fn = onTaskDispatchedEffect(
      { runtime, schema: Task, retryConfig: { maxAttempts: 5 } },
      () => Effect.fail(new HttpsError('unavailable', 'downstream 503')),
    );

    const { response, sent } = makeResponse();
    await fn(makeRequest({ amount: 5 }), response);

    // `unavailable` -> 503, a 5XX retry-class failure -> retried.
    expect(sent.status).toBe(503);
    expect(sent.ended).toBe(true);
  });

  it('answers HTTP 204 for a malformed payload when onSetupError acks (skip preserved)', async () => {
    let handlerRan = false;
    let setupError: FunctionSetupError | undefined;
    const fn = onTaskDispatchedEffect(
      {
        runtime,
        schema: Task,
        onSetupError: (error) =>
          Effect.sync(() => {
            setupError = error;
          }),
      },
      () =>
        Effect.sync(() => {
          handlerRan = true;
        }),
    );

    const { response, sent } = makeResponse();
    await fn(makeRequest({ amount: 'not-a-number' }), response);

    expect(handlerRan).toBe(false);
    expect(setupError?.phase).toBe('decode-task');
    expect(sent.status).toBe(204);
    expect(sent.ended).toBe(true);
  });

  it('rethrows a decode defect by default so the SDK answers non-2xx and Cloud Tasks retries to exhaustion', async () => {
    // Without onSetupError, the decode failure becomes Effect.die. The
    // wrapper rethrows the defect, so onDispatchHandler answers 500 and
    // Cloud Tasks retries up to maxAttempts before exhaustion removes the
    // payload (or routes it to a dead-letter queue).
    const fn = onTaskDispatchedEffect(
      { runtime, schema: Task, retryConfig: { maxAttempts: 5 } },
      () => Effect.void,
    );

    const { response, sent } = makeResponse();
    await fn(makeRequest({ amount: 'not-a-number' }), response);

    expect(sent.status).toBe(500);
    expect(sent.ended).toBe(true);
  });
});
