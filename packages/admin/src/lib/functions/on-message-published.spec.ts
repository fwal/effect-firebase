import { describe, expect, it } from '@effect/vitest';
import {
  Context,
  Effect,
  Layer,
  ManagedRuntime,
  Schema,
  SchemaGetter,
} from 'effect';
import { CloudEvent } from 'firebase-functions/v2';
import { MessagePublishedData } from 'firebase-functions/v2/pubsub';
import { onMessagePublishedEffect } from './on-message-published.js';
import { FunctionSetupError } from './setup-error.js';
import * as PubSub from '../pubsub.js';

const runtime = ManagedRuntime.make(Layer.empty);

const Message = Schema.Struct({ userId: Schema.String });

// A schema whose decoding requires a Context service: its `DecodingServices`
// is `DecoderService`, not `never`. The schema-bearing background-trigger
// wrappers must widen the runtime contract to `R | S['DecodingServices']`
// so a runtime that omits the service is rejected at compile time.
interface DecoderServiceShape {
  readonly transform: (s: string) => string;
}
class DecoderService extends Context.Service<
  DecoderService,
  DecoderServiceShape
>()('@effect-firebase/admin/test/DecoderService') {}

const ServiceBoundMessage = Schema.String.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transformEffect((input: string) =>
      Effect.gen(function* () {
        const svc = yield* DecoderService;
        return svc.transform(input);
      }),
    ),
    encode: SchemaGetter.transform((s: string) => s),
  }),
);

/** Mirrors firebase-functions: `json` parses on access and throws on bad data. */
const makeEvent = <T = unknown>(
  raw: string,
): CloudEvent<MessagePublishedData<T>> =>
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
  }) as unknown as CloudEvent<MessagePublishedData<T>>;

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

  describe('messageSchema decoding services', () => {
    it('widens the runtime contract to include the schema DecodingServices', () => {
      const sufficientRuntime = ManagedRuntime.make(
        Layer.succeed(DecoderService, {
          transform: (s: string) => s.toUpperCase(),
        }),
      );
      const insufficientRuntime = ManagedRuntime.make(Layer.empty);

      // A runtime that provides `DecoderService` satisfies the widened
      // `R | S['DecodingServices']` contract.
      const sufficient = onMessagePublishedEffect(
        {
          runtime: sufficientRuntime,
          topic: 't',
          messageSchema: ServiceBoundMessage,
        },
        () => Effect.void,
      );

      // A runtime omitting `DecoderService` must be rejected at compile time,
      // matching the sibling background-trigger wrappers. Removing this
      // directive must surface TS2769 "No overload matches this call" — the
      // same shape `onTaskDispatchedEffect` enforces.
      // @ts-expect-error insufficient runtime omits the schema DecodingServices
      const insufficient = onMessagePublishedEffect(
        {
          runtime: insufficientRuntime,
          topic: 't',
          messageSchema: ServiceBoundMessage,
        },
        () => Effect.void,
      );

      expect(sufficient).toBeDefined();
      expect(insufficient).toBeDefined();
    });

    it('runs the handler with the decoded value when the runtime provides the service', async () => {
      let seen: string | undefined;
      const fn = onMessagePublishedEffect(
        {
          runtime: ManagedRuntime.make(
            Layer.succeed(DecoderService, {
              transform: (s: string) => s.toUpperCase(),
            }),
          ),
          topic: 't',
          messageSchema: ServiceBoundMessage,
        },
        (message) =>
          Effect.sync(() => {
            seen = message;
          }),
      );
      await fn.run(
        makeEvent(b64('"hello"')) as CloudEvent<MessagePublishedData<string>>,
      );
      expect(seen).toBe('HELLO');
    });
  });

  describe('JSON wire format', () => {
    // The production shape: a required `NullishOr` field set to `undefined`.
    const Event = Schema.Struct({
      eventId: Schema.String,
      networkId: Schema.NullishOr(Schema.String),
    });
    const value = { eventId: 'e1', networkId: undefined };

    /** Capture what `@google-cloud/pubsub` would put on the wire. */
    const publishedEvent = (json: unknown) =>
      makeEvent(b64(JSON.stringify(json)));

    const consume = async (event: CloudEvent<MessagePublishedData>) => {
      let seen: typeof Event.Type | undefined;
      let setupError: FunctionSetupError | undefined;
      const fn = onMessagePublishedEffect(
        {
          runtime,
          topic: 't',
          messageSchema: Event,
          onSetupError: (error) =>
            Effect.sync(() => {
              setupError = error;
            }),
        },
        (message) =>
          Effect.sync(() => {
            seen = message;
          }),
      );
      await fn.run(event);
      return { seen, setupError };
    };

    it('old path: plain encodeEffect drops the key and decoding fails', async () => {
      const json = await Effect.runPromise(Schema.encodeEffect(Event)(value));
      const { seen, setupError } = await consume(publishedEvent(json));

      expect(seen).toBeUndefined();
      expect(setupError?.phase).toBe('decode-message');
      expect(setupError?.cause.message).toContain('Missing key');
      expect(setupError?.cause.message).toContain('networkId');
    });

    it('new path: PubSub.publish encodes undefined as null and decoding succeeds', async () => {
      let wire: unknown;
      const client: PubSub.Client = {
        topic: () => ({
          publishMessage: (message) => {
            wire = message.json;
            return Promise.resolve('m1');
          },
        }),
      };
      await Effect.runPromise(
        PubSub.publish('t', Event, value).pipe(
          Effect.provide(PubSub.layer(client)),
        ),
      );
      expect(wire).toEqual({ eventId: 'e1', networkId: null });

      const { seen, setupError } = await consume(publishedEvent(wire));
      expect(setupError).toBeUndefined();
      expect(seen).toEqual({ eventId: 'e1', networkId: null });
    });

    it('still decodes messages queued by an old publisher', async () => {
      const { seen } = await consume(
        publishedEvent({ eventId: 'e1', networkId: 'n1' }),
      );
      expect(seen).toEqual({ eventId: 'e1', networkId: 'n1' });
    });

    it('accepts null for an optional field', async () => {
      let seen: unknown;
      const fn = onMessagePublishedEffect(
        {
          runtime,
          topic: 't',
          messageSchema: Schema.Struct({ a: Schema.optional(Schema.String) }),
        },
        (message) =>
          Effect.sync(() => {
            seen = message;
          }),
      );
      await fn.run(makeEvent(b64('{"a":null}')));
      expect(seen).toEqual({ a: undefined });
    });

    it('decodes Date fields from ISO strings', async () => {
      let seen: unknown;
      const fn = onMessagePublishedEffect(
        {
          runtime,
          topic: 't',
          messageSchema: Schema.Struct({ at: Schema.Date }),
        },
        (message) =>
          Effect.sync(() => {
            seen = message.at;
          }),
      );
      await fn.run(makeEvent(b64('{"at":"2024-01-01T00:00:00.000Z"}')));
      expect(seen).toEqual(new Date('2024-01-01T00:00:00.000Z'));
    });
  });
});
