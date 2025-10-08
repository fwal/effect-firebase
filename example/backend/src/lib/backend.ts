import {
  HttpsFunction,
  HttpsOptions,
  Request,
  onRequest,
} from 'firebase-functions/v2/https';
import { Response } from 'express';
import { ManagedRuntime, Effect, Logger } from 'effect';
import { logger } from 'firebase-functions';

function makeRuntime() {
  const cloudLogger = Logger.replace(
    Logger.defaultLogger,
    Logger.make(({ message }) => {
      logger.log(message);
    })
  );
  return ManagedRuntime.make(cloudLogger);
}

async function run<A>(effect: Effect.Effect<A, unknown>) {
  const runtime = makeRuntime();
  const result = await runtime.runPromise(effect);
  await runtime.dispose();
  return result;
}

function onRequestEffect(
  options: HttpsOptions,
  handler: (request: Request, response: Response) => Effect.Effect<void, never>
): HttpsFunction {
  return onRequest(options, async (request, response) => {
    const result = await run(handler(request, response));
    response.send(result);
  });
}

export const functionB = onRequestEffect(
  {
    region: 'europe-north1',
    cors: true,
  },
  (request, response) => Effect.succeed(response.send('Hello world!'))
);
