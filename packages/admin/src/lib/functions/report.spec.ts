import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
} from '@effect/vitest';
import { Data, Effect, ErrorReporter, Layer, ManagedRuntime } from 'effect';
import { logger } from 'firebase-functions';
import { CallableRequest, HttpsError } from 'firebase-functions/https';
import { onCallEffect } from './on-call.js';
import { isExpectedRejection } from './report.js';

const runtime = ManagedRuntime.make(Layer.empty);

class QuietError extends Data.TaggedError('QuietError')<{
  readonly reason: string;
}> {
  override readonly [ErrorReporter.ignore] = true;
}

class LoudError extends Data.TaggedError('LoudError')<{
  readonly reason: string;
}> {}

const makeRequest = (data: unknown): CallableRequest =>
  ({ data, rawRequest: {}, acceptsStreaming: false }) as CallableRequest;

const runRejecting = async (error: unknown) => {
  const fn = onCallEffect({ runtime }, () => Effect.fail(error));
  return await fn
    .run(makeRequest({}))
    .then(() => undefined)
    .catch((e: unknown) => e);
};

describe('isExpectedRejection', () => {
  it('recognises an HttpsError', () => {
    expect(isExpectedRejection(new HttpsError('not-found', 'nope'))).toBe(true);
  });

  it('recognises an error annotated with ErrorReporter.ignore', () => {
    expect(isExpectedRejection(new QuietError({ reason: 'x' }))).toBe(true);
  });

  it('does not recognise an ordinary tagged error', () => {
    expect(isExpectedRejection(new LoudError({ reason: 'x' }))).toBe(false);
  });
});

describe('onCallEffect defect logging', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('does not log an HttpsError as a defect, but still rethrows it', async () => {
    const error = await runRejecting(new HttpsError('not-found', 'nope'));
    expect(error).toBeInstanceOf(HttpsError);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not log an error annotated with ErrorReporter.ignore', async () => {
    const error = await runRejecting(new QuietError({ reason: 'expected' }));
    expect(error).toBeInstanceOf(QuietError);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs an unannotated error as a defect', async () => {
    const error = await runRejecting(new LoudError({ reason: 'unexpected' }));
    expect(error).toBeInstanceOf(LoudError);
    expect(errorSpy).toHaveBeenCalledWith(
      'Defect in onCall',
      expect.objectContaining({ inner: expect.any(LoudError) }),
    );
  });
});
