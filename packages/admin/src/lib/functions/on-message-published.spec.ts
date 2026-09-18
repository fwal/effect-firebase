import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { CloudEvent } from 'firebase-functions/v2';
import { MessagePublishedData } from 'firebase-functions/v2/pubsub';
import { onMessagePublishedEffect } from './on-message-published.js';
import { FunctionSetupError } from './setup-error.js';

const runtime = ManagedRuntime.make(Layer.empty);

const Message = Schema.Struct({ userId: Schema.String });

/** Mirrors firebase-functions: `json` parses on access and throws on bad data. */
const makeEvent = (raw: string): CloudEvent<MessagePublishedData<unknown>> =>
  ({
    data: {
      message: {
        get json() {
          try {
            return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
          } catch (err) {
            throw new Error(
              `Unable to parse Pub/Sub message data as JSON: ${(err as Error).message}`,
            );
          }
        },
      },
    },
  }) as unknown as CloudEvent<MessagePublishedData<unknown>>;

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

describe('onMessagePublishedEffect', () => {
  it('decodes a valid message and runs the handler', async () => {
    let seen: { userId: string } | undefined;
    const fn = onMessagePublishedEffect(
      { runtime, topic: 't', messageSchema: Message },
      (message) =>
        Effect.sync(() => {
          seen = message;
        }),
    );
    await fn.run(makeEvent(b64('{"userId":"u1"}')));
    expect(seen).toEqual({ userId: 'u1' });
  });

  it('routes a non-JSON payload to onSetupError instead of a defect', async () => {
    let setupError: FunctionSetupError | undefined;
    let handlerRan = false;
    const fn = onMessagePublishedEffect(
      {
        runtime,
        topic: 't',
        messageSchema: Message,
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

    await fn.run(makeEvent(b64('not json at all')));

    expect(handlerRan).toBe(false);
    expect(setupError?.phase).toBe('decode-message');
    expect(setupError?.cause.message).toContain('Unable to parse');
  });

  it('routes a schema mismatch to onSetupError', async () => {
    let setupError: FunctionSetupError | undefined;
    const fn = onMessagePublishedEffect(
      {
        runtime,
        topic: 't',
        messageSchema: Message,
        onSetupError: (error) =>
          Effect.sync(() => {
            setupError = error;
          }),
      },
      () => Effect.void,
    );

    await fn.run(makeEvent(b64('{"userId":42}')));
    expect(setupError?.phase).toBe('decode-message');
  });
});
