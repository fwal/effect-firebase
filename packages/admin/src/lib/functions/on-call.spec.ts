import { describe, expect, it } from 'vitest';
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { CallableRequest, HttpsError } from 'firebase-functions/https';
import { onCallEffect } from './on-call.js';
import { FunctionSetupError } from './setup-error.js';

const runtime = ManagedRuntime.make(Layer.empty);

const Input = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
});

const Output = Schema.Struct({
  greeting: Schema.String,
});

const makeRequest = (data: unknown): CallableRequest =>
  ({
    data,
    rawRequest: {},
    acceptsStreaming: false,
  }) as CallableRequest;

describe('onCallEffect', () => {
  describe('with valid input', () => {
    it('decodes input, runs the handler, and encodes output', async () => {
      const fn = onCallEffect(
        { runtime, inputSchema: Input, outputSchema: Output },
        (input) => Effect.succeed({ greeting: `Hello ${input.name}` }),
      );

      const result = await fn.run(makeRequest({ name: 'Ada', age: 36 }));
      expect(result).toEqual({ greeting: 'Hello Ada' });
    });
  });

  describe('with invalid input', () => {
    it('rejects with an invalid-argument HttpsError by default', async () => {
      let handlerRan = false;
      const fn = onCallEffect(
        { runtime, inputSchema: Input, outputSchema: Output },
        (input) => {
          handlerRan = true;
          return Effect.succeed({ greeting: `Hello ${input.name}` });
        },
      );

      const error = await fn
        .run(makeRequest({ name: 'Ada', age: 'not-a-number' }))
        .then(() => undefined)
        .catch((error: unknown) => error);

      expect(error).toBeInstanceOf(HttpsError);
      expect((error as HttpsError).code).toBe('invalid-argument');
      expect(handlerRan).toBe(false);
    });

    it('recovers with a fallback output from onSetupError', async () => {
      let setupError: FunctionSetupError | undefined;
      const fn = onCallEffect(
        {
          runtime,
          inputSchema: Input,
          outputSchema: Output,
          onSetupError: (error) => {
            setupError = error;
            return Effect.succeed({ greeting: 'Hello stranger' });
          },
        },
        (input) => Effect.succeed({ greeting: `Hello ${input.name}` }),
      );

      const result = await fn.run(makeRequest({ age: 36 }));
      expect(result).toEqual({ greeting: 'Hello stranger' });
      expect(setupError?.phase).toBe('decode-input');
    });

    it('rejects with a custom HttpsError from onSetupError', async () => {
      const fn = onCallEffect(
        {
          runtime,
          inputSchema: Input,
          outputSchema: Output,
          onSetupError: (error) =>
            Effect.fail(
              new HttpsError('failed-precondition', error.phase),
            ),
        },
        (input) => Effect.succeed({ greeting: `Hello ${input.name}` }),
      );

      const error = await fn
        .run(makeRequest(null))
        .then(() => undefined)
        .catch((error: unknown) => error);

      expect(error).toBeInstanceOf(HttpsError);
      expect((error as HttpsError).code).toBe('failed-precondition');
      expect((error as HttpsError).message).toBe('decode-input');
    });
  });

  describe('with invalid output', () => {
    it('rejects with an internal HttpsError by default', async () => {
      const fn = onCallEffect(
        { runtime, inputSchema: Input, outputSchema: Output },
        () =>
          Effect.succeed({ greeting: 42 } as unknown as { greeting: string }),
      );

      const error = await fn
        .run(makeRequest({ name: 'Ada', age: 36 }))
        .then(() => undefined)
        .catch((error: unknown) => error);

      expect(error).toBeInstanceOf(HttpsError);
      expect((error as HttpsError).code).toBe('internal');
    });

    it('invokes onSetupError with the encode-output phase', async () => {
      let setupError: FunctionSetupError | undefined;
      const fn = onCallEffect(
        {
          runtime,
          inputSchema: Input,
          outputSchema: Output,
          onSetupError: (error) => {
            setupError = error;
            return Effect.succeed({ greeting: 'fallback' });
          },
        },
        () =>
          Effect.succeed({ greeting: 42 } as unknown as { greeting: string }),
      );

      const result = await fn.run(makeRequest({ name: 'Ada', age: 36 }));
      expect(result).toEqual({ greeting: 'fallback' });
      expect(setupError?.phase).toBe('encode-output');
    });
  });

  describe('handler errors', () => {
    it('propagates an HttpsError failed by the handler', async () => {
      const fn = onCallEffect(
        { runtime, inputSchema: Input, outputSchema: Output },
        () => Effect.fail(new HttpsError('not-found', 'Resource not found')),
      );

      const error = await fn
        .run(makeRequest({ name: 'Ada', age: 36 }))
        .then(() => undefined)
        .catch((error: unknown) => error);

      expect(error).toBeInstanceOf(HttpsError);
      expect((error as HttpsError).code).toBe('not-found');
    });
  });
});
