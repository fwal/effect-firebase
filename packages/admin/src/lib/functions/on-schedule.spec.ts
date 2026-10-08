import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from '@effect/vitest';
import { Data, Effect, ErrorReporter, Layer, ManagedRuntime } from 'effect';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/https';
import { ScheduledEvent } from 'firebase-functions/v2/scheduler';
import { onScheduleEffect } from './on-schedule.js';

const runtime = ManagedRuntime.make(Layer.empty);

class QuietError extends Data.TaggedError('QuietError')<{
  readonly reason: string;
}> {
  override readonly [ErrorReporter.ignore] = true;
}

class LoudError extends Data.TaggedError('LoudError')<{
  readonly reason: string;
}> {}

const makeEvent = (): ScheduledEvent =>
  ({
    scheduleTime: '2026-01-01T00:00:00Z',
  }) as ScheduledEvent;

describe('onScheduleEffect', () => {
  describe('defect logging (expected rejections)', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it('does not log an HttpsError as a defect but still rethrows it', async () => {
      const fn = onScheduleEffect({ schedule: '* * * * *', runtime }, () =>
        Effect.fail(new HttpsError('unavailable', 'downstream 503')),
      );

      const error = await (fn.run(makeEvent()) as Promise<void>).then(
        () => undefined,
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(HttpsError);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('does not log an ErrorReporter.ignore-annotated error as a defect but still rethrows it', async () => {
      const fn = onScheduleEffect({ schedule: '* * * * *', runtime }, () =>
        Effect.fail(new QuietError({ reason: 'expected' })),
      );

      const error = await (fn.run(makeEvent()) as Promise<void>).then(
        () => undefined,
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(QuietError);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs an unannotated error as a defect and still rethrows it', async () => {
      const fn = onScheduleEffect({ schedule: '* * * * *', runtime }, () =>
        Effect.fail(new LoudError({ reason: 'unexpected' })),
      );

      const error = await (fn.run(makeEvent()) as Promise<void>).then(
        () => undefined,
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(LoudError);
      expect(errorSpy).toHaveBeenCalledWith(
        'Defect in onSchedule',
        expect.objectContaining({ inner: expect.any(LoudError) }),
      );
    });

    it('logs a die defect as a defect and still rethrows it', async () => {
      const fn = onScheduleEffect({ schedule: '* * * * *', runtime }, () =>
        Effect.die(new LoudError({ reason: 'crashed' })),
      );

      const error = await (fn.run(makeEvent()) as Promise<void>).then(
        () => undefined,
        (e: unknown) => e,
      );

      // A defect (`Effect.die` or a thrown handler error) reaches the catch
      // as the raw error and is logged, not silently rethrown.
      expect(error).toBeInstanceOf(LoudError);
      expect(errorSpy).toHaveBeenCalledWith(
        'Defect in onSchedule',
        expect.objectContaining({ inner: expect.any(LoudError) }),
      );
    });

    it('runs a succeeding handler without logging', async () => {
      let ran = false;
      const fn = onScheduleEffect({ schedule: '* * * * *', runtime }, () =>
        Effect.sync(() => void (ran = true)),
      );

      await fn.run(makeEvent());

      expect(ran).toBe(true);
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
