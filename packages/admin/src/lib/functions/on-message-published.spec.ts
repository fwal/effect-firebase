import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from '@effect/vitest';
import {
  Context,
  Data,
  Effect,
  ErrorReporter,
  Layer,
  ManagedRuntime,
  Schema,
  SchemaGetter,
} from 'effect';
import { CloudEvent } from 'firebase-functions/v2';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/https';
import { MessagePublishedData } from 'firebase-functions/v2/pubsub';
import { onMessagePublishedEffect } from './on-message-published.js';
import { FunctionSetupError } from './setup-error.js';

class QuietError extends Data.TaggedError('QuietError')<{
  readonly reason: string;
}> {
  override readonly [ErrorReporter.ignore] = true;
}

class LoudError extends Data.TaggedError('LoudError')<{
  readonly reason: string;
}> {}

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

  describe('defect logging (expected rejections)', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it('does not log an HttpsError as a defect', async () => {
      const fn = onMessagePublishedEffect({ runtime, topic: 't' }, () =>
        Effect.fail(new HttpsError('unavailable', 'downstream 503')),
      );

      // The background-trigger wrapper swallows after (guarded) logging, so
      // the call resolves rather than rejecting.
      await fn.run(makeEvent(b64('{}')));

      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('does not log an ErrorReporter.ignore-annotated error as a defect', async () => {
      const fn = onMessagePublishedEffect({ runtime, topic: 't' }, () =>
        Effect.fail(new QuietError({ reason: 'expected' })),
      );

      await fn.run(makeEvent(b64('{}')));

      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs an unannotated error as a defect', async () => {
      const fn = onMessagePublishedEffect({ runtime, topic: 't' }, () =>
        Effect.fail(new LoudError({ reason: 'unexpected' })),
      );

      await fn.run(makeEvent(b64('{}')));

      expect(errorSpy).toHaveBeenCalledWith(
        'Defect in onMessagePublished',
        expect.objectContaining({ inner: expect.any(LoudError) }),
      );
    });
  });
});
