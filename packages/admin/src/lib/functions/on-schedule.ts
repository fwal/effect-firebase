import { Effect } from 'effect';
import {
  onSchedule,
  ScheduledEvent,
  ScheduleFunction,
  ScheduleOptions,
} from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { run, Runtime } from './run.js';

interface ScheduleEffectOptions<R> extends ScheduleOptions {
  runtime: Runtime<R>;
}

/**
 * Create a Firebase Functions scheduled trigger that runs an effect on a schedule.
 *
 * @param options - The options for the scheduled trigger including the schedule.
 * @param handler - The handler function that runs the effect.
 * @returns The Firebase Functions scheduled trigger.
 */
export function onScheduleEffect<R, E>(
  options: ScheduleEffectOptions<R>,
  handler: (event: ScheduledEvent) => Effect.Effect<void, E, R>,
): ScheduleFunction {
  return onSchedule(options, async (event) => {
    const effect = handler(event).pipe(Effect.withSpan('onScheduleEffect'));

    // Rethrow after logging so the invocation is recorded as failed and
    // Cloud Scheduler's retry configuration applies.
    await run(options.runtime, effect as Effect.Effect<void, never, R>).catch(
      (error) => {
        logger.error('Defect in onSchedule', {
          inner: error,
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      },
    );
  });
}
