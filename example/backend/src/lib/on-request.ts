import { Effect } from 'effect';
import {
  HttpsFunction,
  HttpsOptions,
  onRequest,
} from 'firebase-functions/https';
import { run } from './runner.js';

function onRequestEffect(
  options: HttpsOptions,
  handler: (request: Request, response: Response) => Effect.Effect<void, never>
): HttpsFunction {
  return onRequest(options, async (request, response) => {
    const result = await run(handler(request, response));
    response.send(result);
  });
}
