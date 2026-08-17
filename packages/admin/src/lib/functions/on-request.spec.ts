import { describe, expect, it } from 'vitest';
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { Request } from 'firebase-functions/https';
import { type Response } from 'express';
import { onRequestEffect } from './on-request.js';
import { FunctionSetupError } from './setup-error.js';

const runtime = ManagedRuntime.make(Layer.empty);

const Body = Schema.Struct({
  title: Schema.String,
});

const Out = Schema.Struct({
  id: Schema.String,
});

const makeRequest = (body: unknown): Request => ({ body }) as Request;

interface SentResponse {
  status?: number;
  json?: unknown;
  sent: boolean;
}

const makeResponse = (): { response: Response; sent: SentResponse } => {
  const sent: SentResponse = { sent: false };
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(payload: unknown) {
      sent.json = payload;
      sent.sent = true;
      return this;
    },
    send() {
      sent.sent = true;
      return this;
    },
  } as unknown as Response;
  return { response, sent };
};

describe('onRequestEffect', () => {
  it('parses the body, runs the handler, and sends the encoded response', async () => {
    const fn = onRequestEffect(
      { runtime, bodySchema: Body, responseSchema: Out, successStatus: 201 },
      (body) => Effect.succeed({ id: `id-${body.title}` }),
    );

    const { response, sent } = makeResponse();
    await fn(makeRequest({ title: 'hello' }), response);

    expect(sent.status).toBe(201);
    expect(sent.json).toEqual({ id: 'id-hello' });
  });

  it('responds with 400 by default when the body is invalid', async () => {
    let handlerRan = false;
    const fn = onRequestEffect(
      { runtime, bodySchema: Body, responseSchema: Out },
      (body) => {
        handlerRan = true;
        return Effect.succeed({ id: `id-${body.title}` });
      },
    );

    const { response, sent } = makeResponse();
    await fn(makeRequest({ title: 42 }), response);

    expect(sent.status).toBe(400);
    expect(sent.json).toEqual({ error: 'Invalid request body' });
    expect(handlerRan).toBe(false);
  });

  it('lets onSetupError write a custom response', async () => {
    let setupError: FunctionSetupError | undefined;
    const fn = onRequestEffect(
      {
        runtime,
        bodySchema: Body,
        responseSchema: Out,
        onSetupError: (error, _request, response) =>
          Effect.sync(() => {
            setupError = error;
            response.status(422).json({ error: 'Unprocessable' });
          }),
      },
      (body) => Effect.succeed({ id: `id-${body.title}` }),
    );

    const { response, sent } = makeResponse();
    await fn(makeRequest({}), response);

    expect(sent.status).toBe(422);
    expect(sent.json).toEqual({ error: 'Unprocessable' });
    expect(setupError?.phase).toBe('decode-body');
  });

  it('responds with 500 by default when the response cannot be encoded', async () => {
    const fn = onRequestEffect(
      { runtime, bodySchema: Body, responseSchema: Out },
      () => Effect.succeed({ id: 42 } as unknown as { id: string }),
    );

    const { response, sent } = makeResponse();
    await fn(makeRequest({ title: 'hello' }), response);

    expect(sent.status).toBe(500);
    expect(sent.sent).toBe(true);
  });
});
