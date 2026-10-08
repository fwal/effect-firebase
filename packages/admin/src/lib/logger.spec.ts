import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from '@effect/vitest';
import { Data, Effect } from 'effect';
import { TestClock } from 'effect/testing';
import { logger } from 'firebase-functions';
import { inspect } from 'node:util';
import { cloudConsole } from './logger.js';

class ExampleError extends Data.TaggedError('ExampleError')<{
  readonly exampleId: string;
}> {}

class Unserializable {
  constructor() {
    Object.defineProperty(this, 'boom', {
      enumerable: true,
      get: () => {
        throw new Error('getter exploded');
      },
    });
  }
}

describe('Logger.cloudConsole', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });

  const args = (spy: ReturnType<typeof vi.spyOn>): Array<unknown> =>
    spy.mock.calls[0] as Array<unknown>;

  it.effect('passes a plain message through unchanged', () =>
    Effect.gen(function* () {
      yield* Effect.logInfo('hello', 42);
      expect(args(infoSpy)).toEqual(['hello', 42]);
    }).pipe(Effect.provide(cloudConsole)),
  );

  it.effect('passes a trailing plain object through unchanged', () =>
    Effect.gen(function* () {
      const payload = { partnerId: 'p1' };
      yield* Effect.logInfo('Received webhook', payload);
      expect(args(infoSpy)).toEqual(['Received webhook', payload]);
      expect(args(infoSpy)[1]).toBe(payload);
    }).pipe(Effect.provide(cloudConsole)),
  );

  it.effect('adds annotations as a trailing payload object', () =>
    Effect.gen(function* () {
      yield* Effect.logInfo('hello').pipe(
        Effect.annotateLogs({ requestId: 'r1', attempt: 2 }),
      );
      expect(args(infoSpy)).toEqual(['hello', { requestId: 'r1', attempt: 2 }]);
    }).pipe(Effect.provide(cloudConsole)),
  );

  it.effect('merges annotations into the trailing object, which wins', () =>
    Effect.gen(function* () {
      yield* Effect.logInfo('hello', {
        partnerId: 'explicit',
        extra: true,
      }).pipe(Effect.annotateLogs({ partnerId: 'annotated', requestId: 'r1' }));
      expect(args(infoSpy)).toEqual([
        'hello',
        { partnerId: 'explicit', requestId: 'r1', extra: true },
      ]);
    }).pipe(Effect.provide(cloudConsole)),
  );

  it.effect('includes a failure cause and passes the real error', () =>
    Effect.gen(function* () {
      const error = new ExampleError({ exampleId: 'e1' });
      const exit = yield* Effect.exit(Effect.fail(error));
      if (exit._tag !== 'Failure') throw new Error('expected failure');
      yield* Effect.logError('Could not run example', exit.cause).pipe(
        Effect.annotateLogs({ exampleId: 'e1' }),
      );
      const [message, passedError, payload] = args(errorSpy) as [
        string,
        unknown,
        Record<string, unknown>,
      ];
      expect(args(errorSpy)).toHaveLength(3);
      expect(message).toBe('Could not run example');
      expect(passedError).toBeInstanceOf(Error);
      expect(passedError).toMatchObject({
        name: 'ExampleError',
        stack: error.stack,
      });
      expect(inspect(passedError)).toBe(error.stack);
      expect(payload['exampleId']).toBe('e1');
      expect(payload['cause']).toEqual(expect.stringContaining('ExampleError'));
    }).pipe(Effect.provide(cloudConsole)),
  );

  it.effect('includes a defect cause', () =>
    Effect.gen(function* () {
      const defect = new Error('kaboom');
      const exit = yield* Effect.exit(Effect.die(defect));
      if (exit._tag !== 'Failure') throw new Error('expected failure');
      yield* Effect.logError('Unexpected', exit.cause);
      const [message, passedError, payload] = args(errorSpy) as [
        string,
        unknown,
        Record<string, unknown>,
      ];
      expect(message).toBe('Unexpected');
      expect(passedError).toMatchObject({
        name: 'Error',
        message: 'kaboom',
        stack: defect.stack,
      });
      expect(payload['cause']).toEqual(expect.stringContaining('kaboom'));
    }).pipe(Effect.provide(cloudConsole)),
  );

  it.effect('renders a non-Error failure into the message', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(Effect.fail('example failure'));
      if (exit._tag !== 'Failure') throw new Error('expected failure');
      yield* Effect.logError('Could not run example', exit.cause);
      const [, failure, payload] = args(errorSpy) as [
        string,
        string,
        Record<string, unknown>,
      ];
      expect(failure).toEqual(expect.stringContaining('example failure'));
      expect(payload['cause']).toBe(failure);
    }).pipe(Effect.provide(cloudConsole)),
  );

  it.effect('adds log spans with their duration', () =>
    Effect.gen(function* () {
      yield* Effect.gen(function* () {
        yield* TestClock.adjust('25 millis');
        yield* Effect.logInfo('done');
      }).pipe(Effect.withLogSpan('example'));
      expect(args(infoSpy)).toEqual(['done', { logSpans: { example: 25 } }]);
    }).pipe(Effect.provide(cloudConsole)),
  );

  it.effect('makes non-serializable annotations JSON-safe', () =>
    Effect.gen(function* () {
      const circular: Record<string, unknown> = { name: 'loop' };
      circular['self'] = circular;
      const exit = yield* Effect.exit(Effect.fail('nested'));
      if (exit._tag !== 'Failure') throw new Error('expected failure');
      yield* Effect.logInfo('hello').pipe(
        Effect.annotateLogs({
          circular,
          instance: new Unserializable(),
          bigint: 10n,
          cause: exit.cause,
          error: new Error('annotated'),
        }),
      );
      const payload = args(infoSpy)[1] as Record<string, unknown>;
      expect(() => JSON.stringify(payload)).not.toThrow();
      expect(payload['circular']).toEqual({ name: 'loop' });
      expect(payload['instance']).toBe('[Unserializable]');
      expect(payload['bigint']).toBe('10n');
      expect(payload['cause']).toMatchObject({ _id: 'Cause' });
      expect(payload['error']).toMatchObject({
        name: 'Error',
        message: 'annotated',
      });
    }).pipe(Effect.provide(cloudConsole)),
  );
});
