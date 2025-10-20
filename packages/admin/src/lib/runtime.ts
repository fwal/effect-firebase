import { Logger, Layer, ManagedRuntime } from 'effect';
import { logger } from 'firebase-functions';

export function makeRuntime<R, E>(layer: Layer.Layer<R, E, never>) {
  return ManagedRuntime.make(layer);
}

export const CloudLogger = Logger.replace(
  Logger.defaultLogger,
  Logger.make(({ message }) => {
    logger.log(message);
  })
);
